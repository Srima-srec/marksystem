const express = require('express');
const cors = require('cors');
const dayjs = require('dayjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true }));
app.use(express.json());

function calculateAverageAndGrade({ tamil, english, maths, science, social }) {
	const scores = [tamil, english, maths, science, social].map(Number);
	const validScores = scores.map(s => (Number.isFinite(s) ? s : 0));
	const sum = validScores.reduce((a, b) => a + b, 0);
	const avg = Number((sum / validScores.length).toFixed(2));
	let grade = 'C';
	if (avg >= 90) grade = 'A+';
	else if (avg >= 75) grade = 'A';
	else if (avg >= 60) grade = 'B';
	else grade = 'C';
	return { avg, grade };
}

// Students - list all (joined with marks summary)
app.get('/api/students', (req, res) => {
	try {
		const rows = db
			.prepare(`
				SELECT s.rollno, s.name, s.class, s.section, s.DOB, s.handlingfaculty,
					m.tamil, m.english, m.maths, m.science, m.social, m.avg, m.grade
				FROM Student s
				LEFT JOIN StudentMarks m ON m.rollno = s.rollno
				ORDER BY s.rollno ASC
			`)
			.all();
		res.json(rows);
	} catch (err) {
		res.status(500).json({ error: 'Failed to fetch students', details: String(err) });
	}
});

// Student by rollno - include parents and marks
app.get('/api/students/:rollno', (req, res) => {
	try {
		const { rollno } = req.params;
		const student = db.prepare('SELECT * FROM Student WHERE rollno = ?').get(rollno);
		if (!student) return res.status(404).json({ error: 'Student not found' });
		const marks = db.prepare('SELECT * FROM StudentMarks WHERE rollno = ?').get(rollno) || null;
		const parents = db.prepare('SELECT * FROM Parents WHERE rollno = ?').get(rollno) || null;
		res.json({ student, marks, parents });
	} catch (err) {
		res.status(500).json({ error: 'Failed to fetch student', details: String(err) });
	}
});

// Create student (and optional parents)
app.post('/api/students', (req, res) => {
	const { rollno, name, class: className, section, DOB, handlingfaculty, parents } = req.body;
	if (!rollno || !name) return res.status(400).json({ error: 'rollno and name are required' });
	try {
		const insertStudent = db.prepare(`
			INSERT INTO Student (rollno, name, class, section, DOB, handlingfaculty)
			VALUES (?, ?, ?, ?, ?, ?)
		`);
		insertStudent.run(rollno, name, className || '', section || '', DOB || '', handlingfaculty || '');

		// Initialize marks row if not present
		const existingMarks = db.prepare('SELECT 1 FROM StudentMarks WHERE rollno = ?').get(rollno);
		if (!existingMarks) {
			const { avg, grade } = calculateAverageAndGrade({ tamil: 0, english: 0, maths: 0, science: 0, social: 0 });
			db
				.prepare(`INSERT INTO StudentMarks (rollno, tamil, english, maths, science, social, avg, grade)
					VALUES (?, 0, 0, 0, 0, 0, ?, ?)`)
				.run(rollno, avg, grade);
		}

		if (parents) {
			const { parentsname, phonenumber, emailid, address } = parents;
			db
				.prepare(`REPLACE INTO Parents (rollno, parentsname, phonenumber, emailid, address)
					VALUES (?, ?, ?, ?, ?)`)
				.run(rollno, parentsname || '', phonenumber || '', emailid || '', address || '');
		}

		return res.status(201).json({ ok: true });
	} catch (err) {
		if (String(err).includes('UNIQUE')) return res.status(409).json({ error: 'Student already exists' });
		return res.status(500).json({ error: 'Failed to create student', details: String(err) });
	}
});

// Update student (and optional parents)
app.put('/api/students/:rollno', (req, res) => {
	try {
		const { rollno } = req.params;
		const existing = db.prepare('SELECT 1 FROM Student WHERE rollno = ?').get(rollno);
		if (!existing) return res.status(404).json({ error: 'Student not found' });
		const { name, class: className, section, DOB, handlingfaculty, parents } = req.body;
		db
			.prepare(`UPDATE Student SET name = COALESCE(?, name), class = COALESCE(?, class), section = COALESCE(?, section), DOB = COALESCE(?, DOB), handlingfaculty = COALESCE(?, handlingfaculty) WHERE rollno = ?`)
			.run(name ?? null, className ?? null, section ?? null, DOB ?? null, handlingfaculty ?? null, rollno);
		if (parents) {
			const { parentsname, phonenumber, emailid, address } = parents;
			db
				.prepare(`REPLACE INTO Parents (rollno, parentsname, phonenumber, emailid, address) VALUES (?, ?, ?, ?, ?)`)
				.run(rollno, parentsname || '', phonenumber || '', emailid || '', address || '');
		}
		return res.json({ ok: true });
	} catch (err) {
		return res.status(500).json({ error: 'Failed to update student', details: String(err) });
	}
});

// Delete student (cascades)
app.delete('/api/students/:rollno', (req, res) => {
	try {
		const { rollno } = req.params;
		const info = db.prepare('DELETE FROM Student WHERE rollno = ?').run(rollno);
		if (info.changes === 0) return res.status(404).json({ error: 'Student not found' });
		return res.json({ ok: true });
	} catch (err) {
		return res.status(500).json({ error: 'Failed to delete student', details: String(err) });
	}
});

// Marks - list
app.get('/api/marks', (req, res) => {
	try {
		const rows = db
			.prepare(`
				SELECT s.rollno, s.name, s.class, s.section, m.tamil, m.english, m.maths, m.science, m.social, m.avg, m.grade
				FROM Student s LEFT JOIN StudentMarks m ON m.rollno = s.rollno
				ORDER BY s.rollno ASC
			`)
			.all();
		res.json(rows);
	} catch (err) {
		res.status(500).json({ error: 'Failed to fetch marks', details: String(err) });
	}
});

// Marks - add/update with auto-calc
app.post('/api/marks', (req, res) => {
	const { rollno, tamil, english, maths, science, social } = req.body;
	if (!rollno) return res.status(400).json({ error: 'rollno is required' });
	try {
		const exists = db.prepare('SELECT 1 FROM Student WHERE rollno = ?').get(rollno);
		if (!exists) return res.status(404).json({ error: 'Student not found' });
		const { avg, grade } = calculateAverageAndGrade({ tamil, english, maths, science, social });
		db
			.prepare(`REPLACE INTO StudentMarks (rollno, tamil, english, maths, science, social, avg, grade)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
			.run(rollno, Number(tamil) || 0, Number(english) || 0, Number(maths) || 0, Number(science) || 0, Number(social) || 0, avg, grade);
		return res.json({ ok: true, avg, grade });
	} catch (err) {
		return res.status(500).json({ error: 'Failed to upsert marks', details: String(err) });
	}
});

// Messages - list for student
app.get('/api/messages', (req, res) => {
	try {
		const { rollno } = req.query;
		if (!rollno) return res.status(400).json({ error: 'rollno is required' });
		const rows = db
			.prepare(`SELECT * FROM Messenger WHERE rollno = ? ORDER BY timestamp ASC`)
			.all(rollno);
		res.json(rows);
	} catch (err) {
		res.status(500).json({ error: 'Failed to fetch messages', details: String(err) });
	}
});

// Messages - send
app.post('/api/messages', (req, res) => {
	try {
		const { rollno, fromid, toid, content, phonenumber } = req.body;
		if (!rollno || !fromid || !toid || !content) return res.status(400).json({ error: 'rollno, fromid, toid, content required' });
		const exists = db.prepare('SELECT 1 FROM Student WHERE rollno = ?').get(rollno);
		if (!exists) return res.status(404).json({ error: 'Student not found' });
		const timestamp = dayjs().toISOString();
		db
			.prepare(`INSERT INTO Messenger (rollno, fromid, toid, content, status, phonenumber, timestamp)
				VALUES (?, ?, ?, ?, ?, ?, ?)`)
			.run(rollno, String(fromid), String(toid), String(content), 'delivered', phonenumber ? String(phonenumber) : '', timestamp);
		return res.status(201).json({ ok: true, timestamp });
	} catch (err) {
		return res.status(500).json({ error: 'Failed to send message', details: String(err) });
	}
});

// Health
app.get('/api/health', (req, res) => {
	res.json({ ok: true });
});

app.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
});


