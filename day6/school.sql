PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

CREATE TABLE students (
  student_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  course_id INTEGER PRIMARY KEY,
  course_name TEXT NOT NULL,
  teacher TEXT NOT NULL
);

CREATE TABLE enrolments (
  enrolment_id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  grade TEXT,
  FOREIGN KEY (student_id) REFERENCES students(student_id),
  FOREIGN KEY (course_id) REFERENCES courses(course_id),
  UNIQUE (student_id, course_id)
);

INSERT INTO students (student_id, name, email) VALUES
  (1, 'Alice Johnson', 'alice@example.com'),
  (2, 'Ben Carter', 'ben@example.com'),
  (3, 'Chloe Smith', 'chloe@example.com'),
  (4, 'Dana Lee', 'dana@example.com');

INSERT INTO courses (course_id, course_name, teacher) VALUES
  (1, 'Mathematics', 'Dr. Patel'),
  (2, 'Computer Science', 'Ms. Garcia'),
  (3, 'History', 'Mr. Williams');

INSERT INTO enrolments (enrolment_id, student_id, course_id, grade) VALUES
  (1, 1, 1, 'A'),
  (2, 1, 2, 'B+'),
  (3, 2, 1, 'B'),
  (4, 2, 3, 'A-'),
  (5, 3, 2, 'A');

-- 1. All courses for one student, selected by the student's name.
SELECT c.course_name, e.grade
FROM courses AS c
JOIN enrolments AS e ON e.course_id = c.course_id
JOIN students AS s ON s.student_id = e.student_id
WHERE s.name = 'Alice Johnson'
ORDER BY c.course_name;

-- 2. All students enrolled on one course.
SELECT s.name, s.email, e.grade
FROM students AS s
JOIN enrolments AS e ON e.student_id = s.student_id
JOIN courses AS c ON c.course_id = e.course_id
WHERE c.course_name = 'Mathematics'
ORDER BY s.name;

-- 3. Number of students per course, including courses with no enrolments.
SELECT c.course_name, COUNT(e.student_id) AS student_count
FROM courses AS c
LEFT JOIN enrolments AS e ON e.course_id = c.course_id
GROUP BY c.course_id, c.course_name
ORDER BY c.course_name;

-- 4. Students who have no enrolments.
SELECT s.name, s.email
FROM students AS s
LEFT JOIN enrolments AS e ON e.student_id = s.student_id
WHERE e.enrolment_id IS NULL
ORDER BY s.name;

-- 5. Update one enrolment's grade.
UPDATE enrolments
SET grade = 'A+'
WHERE student_id = 3 AND course_id = 2;

SELECT s.name, c.course_name, e.grade
FROM enrolments AS e
JOIN students AS s ON s.student_id = e.student_id
JOIN courses AS c ON c.course_id = e.course_id
WHERE e.student_id = 3 AND e.course_id = 2;
