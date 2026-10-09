# School Database Design

## Tables

The `students` table stores one row for each student. It has a primary key, a required name and a required email address. The `UNIQUE` constraint on `email` prevents two student records from using the same email address.

The `courses` table stores the courses offered by the school. Each course has a primary key, a required course name and a required teacher name.

The `enrolments` table stores the fact that a student is taking a course. It contains foreign keys to both `students` and `courses`, as well as the student's grade for that course. Its own primary key identifies each enrolment. The composite `UNIQUE (student_id, course_id)` constraint prevents the same student from enrolling on the same course twice.

## Relationships

A student can have many enrolments, but each enrolment belongs to one student, so `students` to `enrolments` is a one-to-many relationship. A course can also have many enrolments, while each enrolment belongs to one course, so `courses` to `enrolments` is another one-to-many relationship.

Viewed directly, students and courses have a many-to-many relationship: one student can take many courses and one course can contain many students. The `enrolments` table is needed as a join table because it represents each pairing and stores relationship-specific data, such as the student's grade. It also gives us a place to enforce the rule that a student-course pair can occur only once.

## Index

I would add an index on `enrolments(course_id)`. Queries that list all students on a course and count students per course filter or join using `course_id`, so this index would help SQLite find those enrolment rows more efficiently as the database grows. SQLite may also create useful indexes for primary keys and the unique constraints automatically, but the foreign-key lookup deserves an explicit index.

## SQL or NoSQL?

I would choose SQL for this system. Students, courses and enrolments have clear relationships, and the database needs foreign keys, uniqueness rules and reliable joins to answer questions such as which students are on a course and how many students each course has. A relational database also keeps grades attached to a specific student-course relationship and provides transactions for safe updates. NoSQL could work for a simple document-based prototype, but SQL matches this structured, relationship-heavy school data more naturally.
