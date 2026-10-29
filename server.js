const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const db = require('./database'); // <-- Traemos la base de datos
const bcrypt = require('bcryptjs');

const app = express();
const PUERTO = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

const DIRECTORIO_DATOS = process.env.RENDER ? '/var/data' : '.';

if (!fs.existsSync(path.join(DIRECTORIO_DATOS, 'uploads'))) {
    fs.mkdirSync(path.join(DIRECTORIO_DATOS, 'uploads'), { recursive: true });
}

// Configuración de subida
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

// ============ RUTAS DE ESTUDIANTES (NUEVO) ============

// Crear un nuevo estudiante
app.post('/api/estudiantes', async (req, res) => {
    const { nombres, apellidos, email, curso, acudiente_email, password } = req.body;
    
    if (!nombres || !apellidos) {
        return res.status(400).json({ error: 'Faltan nombres o apellidos' });
    }

    // Encriptar la contraseña si el docente la escribió
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

// Obtener la lista de todos los estudiantes
app.get('/api/estudiantes', (req, res) => {
    db.all('SELECT * FROM estudiantes ORDER BY apellidos ASC, nombres ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ============ RUTA PARA BUSCAR AL HIJO DEL PADRE ============
app.get('/api/mi-hijo/:acudienteEmail', (req, res) => {
    db.get(
        'SELECT * FROM estudiantes WHERE acudiente_email = ?', 
        [req.params.acudienteEmail], 
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'No se encontró ningún estudiante con este acudiente' });
            res.json(row);
        }
    );
});

// ============ RUTAS DE NOTAS (NUEVO) ============

// Obtener notas de una materia y período específicos (Para la planilla)
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

// Guardar una nota (si ya existe, la actualiza)
app.post('/api/notas', (req, res) => {
    const { emailEstudiante, materia, periodo, nota } = req.body;

    // Verificar si esa nota ya existe
    db.get(
        'SELECT id FROM notas WHERE emailEstudiante = ? AND materia = ? AND periodo = ?',
        [emailEstudiante, materia, periodo],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });

            if (row) {
                // Ya existe: actualizamos
                db.run(
                    'UPDATE notas SET nota = ? WHERE id = ?',
                    [nota, row.id],
                    function(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ ok: true, actualizada: true });
                    }
                );
            } else {
                // No existe: creamos
                db.run(
                    'INSERT INTO notas (emailEstudiante, materia, periodo, nota) VALUES (?, ?, ?, ?)',
                    [emailEstudiante, materia, periodo, nota],
                    function(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ ok: true, nueva: true, id: this.lastID });
                    }
                );
            }
        }
    );
});

// Obtener las notas de un estudiante
app.get('/api/notas/:email', (req, res) => {
    db.all('SELECT * FROM notas WHERE emailEstudiante = ?', [req.params.email], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ============ RUTAS DE INSTITUCIÓN (NUEVO) ============

// Obtener la configuración del colegio
app.get('/api/institucion', (req, res) => {
    db.get('SELECT * FROM institucion WHERE id = 1', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

// Guardar la configuración de texto (nombre, nit, etc.)
app.put('/api/institucion', (req, res) => {
    const { nombre, nit, dane, resolucion, direccion, telefono } = req.body;
    db.run(
        `UPDATE institucion SET 
            nombre = ?, nit = ?, dane = ?, resolucion = ?, direccion = ?, telefono = ? 
         WHERE id = 1`,
        [nombre, nit, dane, resolucion, direccion, telefono],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

// Subir Logo o Escudo
app.post('/api/institucion/imagen/:tipo', upload.single('imagen'), (req, res) => {
    const tipo = req.params.tipo; // 'logo' o 'escudo'
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen' });

    const urlImagen = '/uploads/' + req.file.filename;
    const columna = tipo === 'logo' ? 'logo_url' : 'escudo_url';

    db.run(`UPDATE institucion SET ${columna} = ? WHERE id = 1`, [urlImagen], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, url: urlImagen });
    });
});

// ============ RUTA DE LOGIN (NUEVO) ============
app.post('/api/login', async (req, res) => {
    const { rol, email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Faltan correo o contraseña' });
    }

    try {
        let usuario = null;

        if (rol === 'docente') {
            // Por ahora, el docente tiene una contraseña maestra fija.
            // Más adelante la haremos dinámica también.
            if (email === 'docente@colegio.com' && password === 'admin123') {
                return res.json({ ok: true, rol: 'docente', email: email });
            } else {
                return res.status(401).json({ error: 'Credenciales de docente incorrectas' });
            }
        } 
        
        if (rol === 'estudiante') {
            // Buscar por correo de estudiante
            db.get('SELECT * FROM estudiantes WHERE email = ?', [email], async (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!row) return res.status(401).json({ error: 'Estudiante no encontrado' });

                // Verificar contraseña
                if (!row.password) return res.status(401).json({ error: 'Este estudiante no tiene contraseña asignada. Pide al docente que la cree.' });
                
                const passwordCorrecta = await bcrypt.compare(password, row.password);
                if (!passwordCorrecta) return res.status(401).json({ error: 'Contraseña incorrecta' });

                res.json({ ok: true, rol: 'estudiante', email: row.email, nombre: row.nombres });
            });
        } 
        
        if (rol === 'padre') {
            // Buscar por correo de acudiente
            db.get('SELECT * FROM estudiantes WHERE acudiente_email = ?', [email], async (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!row) return res.status(401).json({ error: 'Acudiente no encontrado' });

                // Nota: Estamos usando la misma contraseña del estudiante para el padre. 
                // Más adelante podríamos hacer una tabla de padres separada.
                if (!row.password) return res.status(401).json({ error: 'Este acudiente no tiene contraseña asignada.' });
                
                const passwordCorrecta = await bcrypt.compare(password, row.password);
                if (!passwordCorrecta) return res.status(401).json({ error: 'Contraseña incorrecta' });

                res.json({ ok: true, rol: 'padre', email: row.acudiente_email, nombre: row.nombres });
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ RUTA PARA RESETEAR CONTRASEÑA (NUEVO) ============
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
                if (this.changes === 0) return res.status(404).json({ error: 'Estudiante no encontrado' });
                res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
            }
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ ACTUALIZAR ESTUDIANTE ============
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

// ============ ELIMINAR ESTUDIANTE ============
app.delete('/api/estudiantes/:id', (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM estudiantes WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.listen(PUERTO, () => {
    console.log(`\n✅ Servidor funcionando en http://localhost:${PUERTO}\n`);
});