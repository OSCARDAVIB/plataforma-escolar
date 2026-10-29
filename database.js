const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Esto crea (o abre) el archivo plataforma.db en la carpeta
const dbPath = process.env.RENDER ? '/var/data/plataforma.db' : './plataforma.db';
const db = new sqlite3.Database(dbPath, (err) => { ... });

// Aquí definimos las "cajas" donde guardaremos los datos
function crearTablas() {
    db.serialize(() => {
        // Tabla de Tareas
        db.run(`CREATE TABLE IF NOT EXISTS tareas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            descripcion TEXT,
            fecha TEXT,
            creada TEXT
        )`);

        // Tabla de Entregas
        db.run(`CREATE TABLE IF NOT EXISTS entregas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tareaId INTEGER,
            emailEstudiante TEXT,
            comentario TEXT,
            nombreArchivo TEXT,
            archivoGuardado TEXT,
            fechaEntrega TEXT,
            calificacion REAL,
            retroalimentacion TEXT
        )`);

        // ¡NUEVO! Tabla de Notas (Para el boletín)
        // Aquí guardaremos las notas por materia y período
        db.run(`CREATE TABLE IF NOT EXISTS notas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emailEstudiante TEXT,
            materia TEXT,
            periodo INTEGER,
            nota REAL,
            observacion TEXT
        )`);

        // ¡NUEVO! Tabla de Estudiantes (Listado oficial)
        db.run(`CREATE TABLE IF NOT EXISTS estudiantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombres TEXT NOT NULL,
            apellidos TEXT NOT NULL,
            email TEXT UNIQUE,
            curso TEXT,
            acudiente_email TEXT
        )`);
        // ¡NUEVO! Tabla de Institución (Configuración)
        db.run(`CREATE TABLE IF NOT EXISTS institucion (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            nombre TEXT,
            nit TEXT,
            dane TEXT,
            resolucion TEXT,
            direccion TEXT,
            telefono TEXT,
            logo_url TEXT,
            escudo_url TEXT
        )`);

        // Agregar columna de contraseña a estudiantes si no existe
        db.all("PRAGMA table_info(estudiantes)", [], (err, columns) => {
            if (!err) {
                const tienePassword = columns.some(c => c.name === 'password');
                if (!tienePassword) {
                    db.run("ALTER TABLE estudiantes ADD COLUMN password TEXT");
                    console.log("✅ Columna 'password' agregada a estudiantes");
                }
            }
        });

        // Insertar una fila vacía si no existe (para que siempre haya datos)
        db.run(`INSERT OR IGNORE INTO institucion (id, nombre) VALUES (1, 'MI INSTITUCIÓN EDUCATIVA')`);
        
        console.log('✅ Tablas creadas/verificadas');
    });
}

module.exports = db;