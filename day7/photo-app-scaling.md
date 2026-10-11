# SnapShare Scaling Plan

## Assumptions and workload estimates

The starting facts are:

- 10 million registered users.
- 10% of registered users are active on a typical day.
- Each daily active user uploads 1 photo per day.
- Each daily active user views 50 feed pages per day.
- Each original photo is 2 MB.
- Each photo has one 50 KB thumbnail.

Additional assumptions:

- A day has 86,400 seconds and a year has 365 days.
- The estimates below use decimal storage units: 1 MB = 1,000,000 bytes and 1 TB = 1,000,000 MB.
- Activity is averaged across a full day; real traffic is uneven, so feed traffic is planned at 5 times the average during peak periods.
- Each feed-page view is counted as one application-level read request, regardless of how many photos are visible on that page.
- Every uploaded photo eventually receives exactly one thumbnail, and no retention or deletion policy is included in the baseline storage estimate.

### Daily active users

```text
10,000,000 registered users × 10% active = 1,000,000 daily active users
```

### Upload rate

```text
1,000,000 active users × 1 upload/day = 1,000,000 uploads/day
1,000,000 ÷ 86,400 = 11.57 uploads/second on average
```

The average upload rate is therefore approximately **11.6 uploads per second**.

### Feed view rate

```text
1,000,000 active users × 50 feed pages/day = 50,000,000 feed views/day
50,000,000 ÷ 86,400 = 578.70 feed views/second on average
578.70 × 5 = 2,893.52 feed views/second at peak
```

The system should plan for approximately **579 feed views per second on average** and **2,894 feed views per second at peak**.

### Photo storage per year

Each photo and its thumbnail require:

```text
2 MB + 0.05 MB = 2.05 MB per uploaded photo
```

Annual uploads and storage are:

```text
1,000,000 uploads/day × 365 days = 365,000,000 photos/year
365,000,000 × 2.05 MB = 748,250,000 MB/year
748,250,000 MB ÷ 1,000,000 = 748.25 TB/year
```

The baseline photo-file storage requirement is therefore approximately **748.25 TB per year**, before replication, backups, metadata, deleted-file retention or storage overhead. The original photos account for 730 TB and thumbnails account for 18.25 TB.

## Read-heavy or write-heavy?

SnapShare is **read-heavy**. The estimated 50 million daily feed views are 50 times the 1 million daily photo uploads, and the peak feed workload is about 2,894 read requests per second. This means the design should scale read paths horizontally, cache feed data and image delivery aggressively, keep the database read path efficient with a read replica, and serve photo bytes through a CDN instead of repeatedly sending them through application servers. Uploads still need a reliable write path, but they are a much smaller request volume than feed reads.

## Where photo files should be stored

Photo files should be stored in durable, scalable **object storage**, with the database storing metadata such as the photo ID, owner, object-storage key, dimensions, timestamps and thumbnail key. Storing multi-megabyte files inside the database would make database backups and replication much larger, increase storage and I/O costs, consume database resources needed for metadata queries, and make CDN delivery less natural. Object storage is designed for large immutable blobs, supports lifecycle policies and durability, and can be connected directly to a CDN.

## Proposed architecture

```text
                         +----------------+
                         |   Mobile/Web   |
                         +--------+-------+
                                  |
                                  v
                         +----------------+
                         |      CDN       |
                         | images + cache |
                         +--------+-------+
                                  |
                         cache miss / API request
                                  v
                         +----------------+
                         | Load Balancer  |
                         +--------+-------+
                                  |
                    +-------------+-------------+
                    |             |             |
                    v             v             v
              +-----------+ +-----------+ +-----------+
              | App       | | App       | | App       |
              | Server 1  | | Server 2  | | Server N  |
              +-----+-----+ +-----+-----+ +-----+-----+
                    |             |             |
                    +-------------+-------------+
                                  |
                    +-------------+-------------+
                    |                           |
                    v                           v
             +-------------+              +-------------+
             | Cache       |              | Primary DB  |
             | feed/data   |              | metadata    |
             +------+------+              +------+------+ 
                    |                            |
                    |                            v
                    |                     +-------------+
                    |                     | Read Replica|
                    |                     +-------------+
                    |
                    +---------------------> feed reads

  Upload bytes -----------------------> +----------------+
                                        | Object Storage |
                                        | originals +    |
                                        | thumbnails     |
                                        +-------+--------+
                                                |
                                                | upload event
                                                v
                                        +----------------+
                                        | Queue          |
                                        +-------+--------+
                                                |
                                                v
                                        +----------------+
                                        | Thumbnail      |
                                        | Worker         |
                                        +-------+--------+
                                                |
                                                +----> Object Storage
                                                +----> Primary DB metadata
```

### Component responsibilities

- **Client:** Captures uploads and requests feed pages from a single application entry point.
- **CDN:** Serves cached thumbnails and originals close to users, reducing latency and origin bandwidth.
- **Load balancer:** Distributes API traffic across healthy app servers and allows them to scale horizontally.
- **App servers:** Authenticate users, validate requests, create feed responses, write metadata and issue upload URLs without keeping user state locally.
- **Cache:** Keeps frequently requested feed pages, timelines or metadata in memory so repeated reads avoid database work.
- **Primary database:** Reliably stores transactional metadata such as users, follows, photo records and object keys.
- **Read replica:** Handles read-only feed and metadata queries so heavy reads do not compete with primary writes.
- **Object storage:** Stores the large original photo files and thumbnails durably and independently from the relational database.
- **Queue:** Buffers thumbnail jobs so upload requests are not blocked by image processing and absorbs bursts safely.
- **Thumbnail worker:** Consumes queued jobs, creates resized thumbnails, uploads them to object storage and records the thumbnail key.

## Photo upload flow

1. The client sends an authenticated request to an app server with the intended file type and basic photo metadata.
2. The app server validates the user, file size and content type, creates a photo record with a processing status, and requests or generates a short-lived object-storage upload URL.
3. The app server returns the upload URL and photo ID to the client; the original file is uploaded directly from the client to object storage, avoiding a second large transfer through the app servers.
4. Object storage confirms the upload and emits an object-created event, or the client calls a completion endpoint that safely publishes the event.
5. The application places a thumbnail job containing the photo ID and object-storage key onto the queue; the API can now return a successful upload response without waiting for resizing.
6. A thumbnail worker takes the job, downloads or streams the original from object storage, creates the 50 KB thumbnail, and uploads the thumbnail under a separate object key.
7. The worker updates the photo metadata in the primary database with the thumbnail key and a ready status; failed jobs are retried and eventually sent to a dead-letter queue for investigation.
8. When the photo appears in a feed, app servers read metadata and CDN URLs, while the CDN serves the thumbnail or original directly from cache or object storage.

## Trade-offs

### Stronger consistency versus read performance

Using a read replica and cache improves feed throughput and reduces primary-database load, but replication and cache invalidation introduce stale reads. A newly uploaded photo might not appear immediately in every feed. SnapShare can accept short delays for normal feeds while reading from the primary for the uploader's own confirmation or other actions that require immediate consistency.

### Direct-to-object-storage uploads versus centralized processing

Direct uploads reduce app-server bandwidth and make upload capacity easier to scale, but they require signed URLs, upload-completion handling and careful validation because the file bypasses the application server. Sending every file through the app servers would simplify control but cost more and create a bottleneck at scale.

### Asynchronous thumbnails versus immediate thumbnails

A queue and worker make the upload API fast and protect it from thumbnail-processing spikes, but users may briefly see a placeholder while the thumbnail is being created. Synchronous processing would provide an immediately complete photo but would increase upload latency and make worker failures directly fail user uploads.

### CDN caching versus fast deletion or privacy changes

Caching images at the CDN greatly reduces latency and origin traffic, but deleting a photo or changing its visibility requires cache invalidation and careful authorization. Shorter cache lifetimes improve freshness and privacy responsiveness while increasing origin requests; longer lifetimes are cheaper and faster but harder to invalidate promptly.
