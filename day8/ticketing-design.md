# TicketHub Event Ticketing System Design

## 1. Requirements

### Functional requirements

- Users can browse upcoming concerts and events, search by artist, venue or date, and view event details.
- Users can view the seat map and current availability for a selected event.
- Users can temporarily hold available seats, with a short expiry such as 10 minutes.
- Users can pay for a valid hold and receive an order and tickets after successful payment.
- Users can view their current and past tickets, and the system can show an order confirmation.
- The system records audit events for holds, payments, expirations, cancellations and refunds.

### Non-functional requirements

- **Speed:** Cached event pages and seat-map reads should respond within 200 ms at p95 under normal load; hold requests should return within 500 ms at p95 when the user has been admitted to the sale.
- **Correctness:** No seat may be sold to two orders, payment must be idempotent, and an expired or failed hold must not remain capable of being paid.
- **Fairness:** During a major sale, a virtual waiting room admits users in arrival order or a documented randomized batch policy, applies one active checkout session per user, and prevents clients from bypassing the queue through repeated requests.
- **Availability:** The browsing path should remain available if a worker or read replica fails, while checkout should fail safely rather than risk incorrect inventory.
- **Security and privacy:** All checkout traffic uses TLS, payment card data is delegated to a PCI-compliant payment provider, and authorization prevents one user from reading another user's orders.
- **Scalability and recovery:** Stateless application servers scale horizontally, the database is backed up with point-in-time recovery, and queues support retries without duplicating orders.

## 2. Estimates

### Normal day

Assumptions for normal traffic:

- 50,000 visitors each view 10 pages, so each page view is one frontend/API request for this first estimate.
- The 5,000 daily ticket sales are spread across 86,400 seconds.
- Normal page traffic is uneven, so a 5x multiplier is used for a busy-hour planning peak.
- A normal purchase averages five dynamic operations (seat availability, hold, checkout, payment confirmation and ticket lookup), in addition to page views.

```text
Normal page views/day = 50,000 × 10 = 500,000
Average page requests/second = 500,000 ÷ 86,400 = 5.79
Busy planning peak = 5.79 × 5 = 28.94 requests/second

Normal ticket sales/day = 5,000
Average completed sales/second = 5,000 ÷ 86,400 = 0.058
Normal purchase API operations/day = 5,000 × 5 = 25,000
Average purchase-operation rate = 25,000 ÷ 86,400 = 0.29 operations/second
```

### Popular concert sale

The sale has 200,000 people attempting to buy 20,000 seats during the first 10 minutes (600 seconds). Assume each attempted buyer makes five dynamic operations while trying to browse, select, hold, pay and confirm. The queue and rate limiter must absorb the request burst rather than allowing all requests to hit the primary database at once.

```text
Sale visitors/second = 200,000 ÷ 600 = 333.33 visitors/second
Attempted purchase-operation rate = 200,000 × 5 ÷ 600 = 1,666.67 operations/second
Seats sold/second if all sell evenly = 20,000 ÷ 600 = 33.33 successful sales/second
```

For capacity planning, a 5x short burst above the ten-minute average is approximately **1,667 operations/second average and 8,333 operations/second burst** at the sale edge. The authoritative inventory write path only needs to commit at most about **33 successful seat sales per second** if the seats sell evenly, but it must safely process many unsuccessful hold attempts and expirations. Compared with normal page traffic of 5.79 requests per second average, the popular-sale edge is roughly **288 times higher** by this five-operation estimate; compared with the 29 requests per second busy planning peak, it is about **288 times higher than that average-derived peak as well when comparing the sale's 1,667 operation rate**.

The critical distinction is that browsing and queue operations can scale horizontally and be cached, while the small but correctness-sensitive inventory transaction must remain serialized per event or per seat partition.

## 3. API design

All endpoints use `/api/v1`, bearer authentication where indicated, JSON bodies and idempotency keys for hold and payment mutations.

| Method | Path | Purpose | Success |
|---|---|---|---|
| `GET` | `/events?query=&date=` | Browse searchable upcoming events; responses can be cached. | `200 OK` |
| `GET` | `/events/{eventId}` | View event, venue and sale details. | `200 OK` |
| `GET` | `/events/{eventId}/seats` | Return a seat map and availability snapshot or version. | `200 OK` |
| `POST` | `/events/{eventId}/holds` | Atomically hold one or more available seats for the authenticated user. | `201 Created` |
| `POST` | `/holds/{holdId}/checkout` | Convert an unexpired hold into a payment attempt using an idempotency key. | `202 Accepted` |
| `POST` | `/payments/{paymentId}/confirm` | Receive or confirm the payment-provider result and finalize the order. | `200 OK` |
| `GET` | `/users/me/tickets` | List the authenticated user's purchased tickets and orders. | `200 OK` |
| `GET` | `/orders/{orderId}` | View one authorized order and its ticket details. | `200 OK` |

A hold response includes `holdId`, the held seat IDs, `expiresAt` and a checkout token. If a requested seat is already held or sold, the API returns `409 Conflict` rather than silently assigning another seat. Payment retries with the same idempotency key return the original result instead of charging twice.

## 4. Data model

### Tables and relationships

- **`users`** stores buyers; one user can have many holds and orders, so `users` to `orders` is one-to-many.
- **`events`** stores concerts and venues; one event has many seats and orders, so `events` to `seats` and `events` to `orders` are one-to-many.
- **`seats`** is the event-specific inventory. Each row represents one seat for one event, with a unique `(event_id, seat_label)` pair and an authoritative status of `available`, `held` or `sold`.
- **`orders`** stores the purchase aggregate and its payment state; one order can contain multiple seats through its order-seat rows.
- **`order_seats`** links orders to seats and records the sale price. It is a join table because an order can contain many seats and a seat is associated with an order only once when sold.
- **`holds`** records temporary reservations, their expiry and the user who owns them. A hold can become the order that buys its seats or expire without a sale.

### Preventing double-booking

The primary database is the source of truth for inventory. A hold runs in a short transaction at serializable isolation or locks the requested `seats` rows with `SELECT ... FOR UPDATE`. It then updates only seats that are `available` or whose `hold_expires_at` is in the past. If the conditional update does not affect every requested row, the transaction rolls back and returns `409 Conflict`. The database also enforces `UNIQUE (event_id, seat_label)` for inventory and `UNIQUE (seat_id)` on `order_seats`, so two concurrent application servers cannot create two sales for the same event seat. Payment finalization re-checks the hold owner and expiry in the same transaction, changes the seat to `sold`, creates the order rows and marks the hold consumed. The payment provider and checkout endpoint use idempotency keys so retries cannot create a second order or charge.

### Example schema sketch

```sql
CREATE TABLE users (
  user_id BIGINT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE events (
  event_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  venue TEXT NOT NULL,
  starts_at TIMESTAMP NOT NULL
);

CREATE TABLE seats (
  seat_id BIGINT PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(event_id),
  seat_label TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'held', 'sold')),
  hold_expires_at TIMESTAMP,
  UNIQUE (event_id, seat_label)
);

CREATE TABLE orders (
  order_id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id),
  event_id BIGINT NOT NULL REFERENCES events(event_id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  idempotency_key TEXT NOT NULL UNIQUE,
  total_cents INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE order_seats (
  order_id BIGINT NOT NULL REFERENCES orders(order_id),
  seat_id BIGINT NOT NULL REFERENCES seats(seat_id),
  price_cents INTEGER NOT NULL,
  PRIMARY KEY (order_id, seat_id),
  UNIQUE (seat_id)
);

CREATE TABLE holds (
  hold_id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id),
  event_id BIGINT NOT NULL REFERENCES events(event_id),
  expires_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'consumed', 'expired'))
);
```

## 5. Architecture

```text
                         +-------------------+
                         | Web / Mobile      |
                         +---------+---------+
                                   |
                                   v
                              +---------+
                              | DNS     |
                              +----+----+
                                   |
                                   v
                              +---------+
                              | CDN/WAF |
                              | rate lim|
                              +----+----+
                                   |
                 browsing          | API
             +---------------------v--------------------+
             |            Load Balancer                 |
             +---------------------+--------------------+
                                   |
                    +--------------+--------------+
                    |                             |
                    v                             v
             +-------------+               +-------------+
             | App servers |               | Sale Gateway|
             | stateless   |               | queue/admit |
             +------+------+               +------+------+ 
                    |                             |
          +---------+---------+                   v
          |                   |             +-----------+
          v                   v             | Hold/     |
      +-------+       +---------------+     | inventory |
      | Cache |       | Primary DB    |<----| service   |
      | event |       | inventory     |     +-----------+
      | pages |       +-------+-------+
      +-------+               |
                              v
                       +--------------+
                       | Read replicas|
                       +--------------+

       App / Sale Gateway -----> +-------+       +-------------+
                                 | Queue | ----> | Workers     |
                                 +-------+       | expiry,     |
                                                 | email, audit|
                                                 +-------------+

       Checkout ------------------------------> Payment Provider
```

### Component explanations

- **Web/mobile clients:** Let users browse, join the waiting room, select seats and complete checkout.
- **DNS:** Resolves the public hostname and can direct users to a healthy regional entry point.
- **CDN/WAF/rate limiter:** Serves cacheable event assets, blocks abusive traffic and limits repeated sale requests before they overload the origin.
- **Load balancer:** Routes requests across healthy stateless app instances and supports horizontal scaling.
- **App servers:** Handle authentication, browsing, order APIs and validation without storing user session state locally.
- **Sale gateway:** Enforces the virtual waiting room and per-event admission rate so only a safe number of users reach inventory writes.
- **Cache:** Stores event details, static seat-map layout and short-lived availability snapshots, keeping read traffic away from the database.
- **Primary database:** Performs authoritative seat holds, payment finalization and order transactions with row locks and constraints.
- **Read replicas:** Serve browsing and non-critical ticket-history reads without competing with inventory writes.
- **Queue:** Buffers email, expiry, audit and payment-reconciliation work during a sale burst.
- **Workers:** Process queued jobs with retries and idempotency, so slow side effects do not block seat transactions.
- **Payment provider:** Handles card data and payment authorization while returning an idempotent result to TicketHub.

### Surviving the popular sale

Before the sale, the CDN and cache absorb event-page and static seat-map traffic. At sale start, the waiting room admits users at a controlled rate and issues short-lived signed admission tokens; users who are not admitted do not repeatedly hit the hold endpoint. Stateless app servers and the load balancer scale out for the admitted traffic. The inventory service partitions or serializes work by event and runs short database transactions against the primary, while read replicas serve browsing. Queue workers and a dead-letter queue handle expirations, notifications and reconciliation without blocking checkout. Monitoring, autoscaling, multi-zone instances, database backups and a tested failover plan remove single-instance failure points.

## 6. Trade-offs

### Strict fairness versus maximum throughput

A waiting room and admission tokens make the sale fairer and protect inventory, but they add queue time and reduce the number of requests accepted immediately. Allowing everyone into checkout could sell seats faster in a perfect case, but it increases overload, retries and the chance of an unfair or failed experience. TicketHub should favor controlled fairness and a clear queue position over unbounded throughput.

### Strong consistency versus availability

Keeping inventory writes on one authoritative primary with serializable transactions prevents double-booking, but a primary outage may temporarily stop holds and checkout. A multi-primary or eventually consistent design could remain more available, but conflict resolution for seats is dangerous and complex. TicketHub should fail closed for inventory correctness, while keeping browsing available from the CDN and read replicas.

### Short holds versus conversion rate

A 10-minute hold gives users time to pay and reduces abandoned seats, but it keeps inventory unavailable longer and increases contention during a popular sale. A shorter hold improves turnover but may punish users with slow payment or accessibility needs. The duration should be measured and adjusted by event, with visible countdowns and automatic expiry.

### Caching availability versus freshness

Caching seat availability reduces database reads and improves map performance, but a cached map can show a seat as available just after another buyer holds it. The cache must be treated as advisory: only the transactional hold operation decides whether a seat is truly available. This preserves speed without weakening the no-double-booking guarantee.
