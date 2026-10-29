const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path'); // <-- ESTA ERA LA LÍNEA QUE FALTABA
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const PUERTO = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Configurar la ruta para el disco persistente de Render
const DIRECTORIO_DATOS = process.env.RENDER ? '/opt/render/project/src' : '.';
const CARPETA_UPLOADS = path.join(DIRECTORIO_DATOS, 'uploads');

// Crear la carpeta de uploads si no existe
if (!fs.existsSync(CARPETA_UPLOADS)) {
    fs.mkdirSync(CARPETA_UPLOADS, { recursive: true });
}

// Servir los archivos subidos
app.use('/uploads', express.static(CARPETA_UPLOADS));

// Configuración de subida de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, CARPETA_UPLOADS);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

// Servir los archivos subidos
app.use('/uploads', express.static(path.join(DIRECTORIO_DATOS, 'uploads')));

// Configuración de subida de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(DIRECTORIO_DATOS, 'uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ============ RUTAS DE TAREAS ============
app.get('/api/tareas', (req, res) => {
    db.all('SELECT * FROM tareas ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/tareas', (req, res) => {
    const { titulo, descripcion, fecha } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Falta el título' });

    const creada = new Date().toISOString();
    db.run(
        'INSERT INTO tareas (titulo, descripcion, fecha, creada) VALUES (?, ?, ?, ?)',
        [titulo, descripcion, fecha, creada],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, titulo, descripcion, fecha });
        }
    );
});

// ============ RUTAS DE ENTREGAS ============
app.get('/api/entregas', (req, res) => {
    db.all('SELECT * FROM entregas', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/entregas', upload.single('archivo'), (req, res) => {
    const { tareaId, emailEstudiante, comentario } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });

    const fechaEntrega = new Date().toISOString();
    db.run(
        `INSERT INTO entregas (tareaId, emailEstudiante, comentario, nombreArchivo, archivoGuardado, fechaEntrega) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tareaId, emailEstudiante, comentario, req.file.originalname, req.file.filename, fechaEntrega],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/entregas/:id', (req, res) => {
    const { calificacion, retroalimentacion } = req.body;
    db.run(
        'UPDATE entregas SET calificacion = ?, retroalimentacion = ? WHERE id = ?',
        [parseFloat(calificacion), retroalimentacion, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

// ============ RUTAS DE ESTUDIANTES ============
app.post('/api/estudiantes', async (req, res) => {
    const { nombres, apellidos, email, curso, acudiente_email, password } = req.body;
    
    if (!nombres || !apellidos) {
        return res.status(400).json({ error: 'Faltan nombres o apellidos' });
    }

    let passwordEncriptada = null;
    if (password) {
        const salt = await bcrypt.genSalt(10);
        passwordEncriptada = await bcrypt.hash(password, salt);
    }

    db.run(
        'INSERT INTO estudiantes (nombres, apellidos, email, curso, acudiente_email, password) VALUES (?, ?, ?, ?, ?, ?)',
        [nombres, apellidos, email, curso || '', acudiente_email || '', passwordEncriptada],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Ese correo ya está registrado' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID, nombres, apellidos, email, curso });
        }
    );
});

app.get('/api/estudiantes', (req, res) => {
    db.all('SELECT * FROM estudiantes ORDER BY apellidos ASC, nombres ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/estudiantes/:id', (req, res) => {
    const { nombres, apellidos, email, curso, acudiente_email } = req.body;
    const id = req.params.id;

    if (!nombres || !apellidos) {
        return res.status(400).json({ error: 'Nombres y apellidos son obligatorios' });
    }

    db.run(
        'UPDATE estudiantes SET nombres = ?, apellidos = ?, email = ?, curso = ?, acudiente_email = ? WHERE id = ?',
        [nombres, apellidos, email, curso, acudiente_email, id],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Ese correo ya está registrado en otro estudiante' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ ok: true });
        }
    );
});

app.delete('/api/estudiantes/:id', (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM estudiantes WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.put('/api/estudiantes/:id/password', async (req, res) => {
    const { nuevaPassword } = req.body;
    const estudianteId = req.params.id;

    if (!nuevaPassword || nuevaPassword.length < 4) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const passwordEncriptada = await bcrypt.hash(nuevaPassword, salt);

        db.run(
            'UPDATE estudiantes SET password = ? WHERE id = ?',
            [passwordEncriptada, estudianteId],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true, mensaje: 'Contraseña actualizada' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ RUTA DE LOGIN ============
app.post('/api/login', async (req, res) => {
    const { rol, email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Faltan correo o contraseña' });
    }

    try {
        if (rol === 'docente') {
            if (email === 'docente@colegio.com' && password === 'admin123') {
                return res.json({ ok: true, rol: 'docente', email: email });
            } else {
                return res.status(401).json({ error: 'Credenciales de docente incorrectas' });
            }
        } 
        
        if (rol === 'estudiante') {
            db.get('SELECT * FROM estudiantes WHERE email = ?', [email], async (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!row) return res.status(401).json({ error: 'Estudiante no encontrado' });
                if (!row.password) return res.status(401).json({ error: 'Sin contraseña asignada' });
                
                const passwordCorrecta = await bcrypt.compare(password, row.password);
                if (!passwordCorrecta) return res.status(401).json({ error: 'Contraseña incorrecta' });

                res.json({ ok: true, rol: 'estudiante', email: row.email, nombre: row.nombres });
            });
        } 
        
        if (rol === 'padre') {
            db.get('SELECT * FROM estudiantes WHERE acudiente_email = ?', [email], async (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!row) return res.status(401).json({ error: 'Acudiente no encontrado' });
                if (!row.password) return res.status(401).json({ error: 'Sin contraseña asignada' });
                
                const passwordCorrecta = await bcrypt.compare(password, row.password);
                if (!passwordCorrecta) return res.status(401).json({ error: 'Contraseña incorrecta' });

                res.json({ ok: true, rol: 'padre', email: row.acudiente_email, nombre: row.nombres });
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ RUTA PARA BUSCAR AL HIJO DEL PADRE ============
app.get('/api/mi-hijo/:acudienteEmail', (req, res) => {
    db.get(
        'SELECT * FROM estudiantes WHERE acudiente_email = ?', 
        [req.params.acudienteEmail], 
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'No se encontró estudiante' });
            res.json(row);
        }
    );
});

// ============ RUTAS DE NOTAS ============
app.post('/api/notas', (req, res) => {
    const { emailEstudiante, materia, periodo, nota } = req.body;

    db.get(
        'SELECT id FROM notas WHERE emailEstudiante = ? AND materia = ? AND periodo = ?',
        [emailEstudiante, materia, periodo],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });

            if (row) {
                db.run('UPDATE notas SET nota = ? WHERE id = ?', [nota, row.id], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ ok: true, actualizada: true });
                });
            } else {
                db.run('INSERT INTO notas (emailEstudiante, materia, periodo, nota) VALUES (?, ?, ?, ?)', 
                    [emailEstudiante, materia, periodo, nota], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ ok: true, nueva: true });
                });
            }
        }
    );
});

app.get('/api/notas/:email', (req, res) => {
    db.all('SELECT * FROM notas WHERE emailEstudiante = ?', [req.params.email], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/notas/planilla/:materia/:periodo', (req, res) => {
    const { materia, periodo } = req.params;
    db.all(
        'SELECT emailEstudiante, nota FROM notas WHERE materia = ? AND periodo = ?', 
        [materia, periodo], 
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// ============ RUTAS DE INSTITUCIÓN ============
app.get('/api/institucion', (req, res) => {
    db.get('SELECT * FROM institucion WHERE id = 1', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

app.put('/api/institucion', (req, res) => {
    const { nombre, nit, dane, resolucion, direccion, telefono } = req.body;
    db.run(
        `UPDATE institucion SET nombre = ?, nit = ?, dane = ?, resolucion = ?, direccion = ?, telefono = ? WHERE id = 1`,
        [nombre, nit, dane, resolucion, direccion, telefono],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.post('/api/institucion/imagen/:tipo', upload.single('imagen'), (req, res) => {
    const tipo = req.params.tipo; 
    if (!req.file) return res.status(400).json({ error: 'No se subió imagen' });

    const urlImagen = '/uploads/' + req.file.filename;
    const columna = tipo === 'logo' ? 'logo_url' : 'escudo_url';

    db.run(`UPDATE institucion SET ${columna} = ? WHERE id = 1`, [urlImagen], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, url: urlImagen });
    });
});

// ============ INICIAR SERVIDOR ============
app.listen(PUERTO, () => {
    console.log(`\n✅ Servidor funcionando en el puerto ${PUERTO}\n`);
});