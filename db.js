const Database = require('better-sqlite3');

const db = new Database('database.sqlite');

db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS Student (
	rollno TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	class TEXT,
	section TEXT,
	DOB TEXT,
	handlingfaculty TEXT
);

CREATE TABLE IF NOT EXISTS StudentMarks (
	rollno TEXT PRIMARY KEY,
	tamil INTEGER DEFAULT 0,
	english INTEGER DEFAULT 0,
	maths INTEGER DEFAULT 0,
	science INTEGER DEFAULT 0,
	social INTEGER DEFAULT 0,
	avg REAL DEFAULT 0,
	grade TEXT DEFAULT 'C',
	FOREIGN KEY (rollno) REFERENCES Student(rollno) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Parents (
	rollno TEXT PRIMARY KEY,
	parentsname TEXT,
	phonenumber TEXT,
	emailid TEXT,
	address TEXT,
	FOREIGN KEY (rollno) REFERENCES Student(rollno) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Messenger (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	rollno TEXT NOT NULL,
	fromid TEXT NOT NULL,
	toid TEXT NOT NULL,
	content TEXT NOT NULL,
	status TEXT DEFAULT 'delivered',
	phonenumber TEXT,
	timestamp TEXT NOT NULL,
	FOREIGN KEY (rollno) REFERENCES Student(rollno) ON DELETE CASCADE
);
`);

// Seed minimal sample data if empty
const existing = db.prepare('SELECT COUNT(*) as c FROM Student').get();
if (existing.c === 0) {
	const insertStudent = db.prepare('INSERT INTO Student (rollno, name, class, section, DOB, handlingfaculty) VALUES (?, ?, ?, ?, ?, ?)');
	insertStudent.run('S001', 'Arun Kumar', '10', 'A', '2010-05-12', 'Mrs. Lakshmi');
	insertStudent.run('S002', 'Priya Sharma', '10', 'B', '2010-08-20', 'Mr. Rajesh');

	const insertMarks = db.prepare('INSERT INTO StudentMarks (rollno, tamil, english, maths, science, social, avg, grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
	insertMarks.run('S001', 85, 92, 88, 79, 90, 86.8, 'A');
	insertMarks.run('S002', 95, 91, 93, 89, 94, 92.4, 'A+');

	const insertParent = db.prepare('INSERT INTO Parents (rollno, parentsname, phonenumber, emailid, address) VALUES (?, ?, ?, ?, ?)');
	insertParent.run('S001', 'Kumar Family', '9876543210', 'kumar.parent@example.com', '12 Gandhi St, Chennai');
	insertParent.run('S002', 'Sharma Family', '9876501234', 'sharma.parent@example.com', '34 Anna Nagar, Chennai');
}

module.exports = db;


