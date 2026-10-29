const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATABASE_PATH = process.env.NOTARIA_DATABASE_PATH || path.join(ROOT, 'notaria.db');
const PORT = Number(process.env.PORT || 8080);
const MAX_REQUEST_BYTES = 25 * 1024 * 1024;
const COLLECTIONS = [
    'users',
    'clients',
    'procedures',
    'document_types',
    'templates',
    'documents',
    'document_versions',
    'notifications',
    'audit_logs',
    'ai_conversations',
    'ai_messages',
];
const STATIC_FILES = new Set(['index.html', 'index.css', 'logo-notaria.jpg', 'tests.html']);
const JS_MODULES = new Set([
    'ai.js',
    'app.js',
    'audit.js',
    'auth.js',
    'clients.js',
    'db.js',
    'documents.js',
    'email.js',
    'procedures.js',
    'templates.js',
]);

fs.mkdirSync(path.dirname(path.resolve(DATABASE_PATH)), { recursive: true });
const database = new DatabaseSync(DATABASE_PATH);
database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS records (
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        PRIMARY KEY (collection, record_id)
    );
`);

function nowIso() {
    return new Date().toISOString();
}

function sendJson(response, status, payload) {
    const body = Buffer.from(JSON.stringify(payload));
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
    });
    response.end(body);
}

function sendError(response, status, message) {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(message);
}

async function readJson(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_REQUEST_BYTES) {
            const error = new Error('El tamaño de la solicitud supera el límite permitido.');
            error.status = 400;
            throw error;
        }
        chunks.push(chunk);
    }

    if (size === 0) return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (cause) {
        const error = new Error('El cuerpo de la solicitud debe contener JSON válido.', { cause });
        error.status = 400;
        throw error;
    }
}

function requireCollection(name) {
    if (!COLLECTIONS.includes(name)) {
        const error = new Error('La colección solicitada no está permitida.');
        error.status = 400;
        throw error;
    }
    return name;
}

function insertRecord(collection, data) {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        const error = new Error('Cada registro debe ser un objeto.');
        error.status = 400;
        throw error;
    }
    const record = {
        id: Object.hasOwn(data, 'id') ? data.id : Date.now() + Math.floor(Math.random() * 1000),
        createdAt: Object.hasOwn(data, 'createdAt') ? data.createdAt : nowIso(),
        ...data,
    };
    const recordId = String(record.id);
    database.prepare(
        'INSERT INTO records (collection, record_id, data_json, created_at) VALUES (?, ?, ?, ?)',
    ).run(collection, recordId, JSON.stringify(record), record.createdAt);
    return record;
}

function inTransaction(callback) {
    database.exec('BEGIN IMMEDIATE');
    try {
        const result = callback();
        database.exec('COMMIT');
        return result;
    } catch (error) {
        database.exec('ROLLBACK');
        throw error;
    }
}

function serveStatic(response, urlPath) {
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    let filePath;
    const rootFile = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
    if (!rootFile.includes('/') && STATIC_FILES.has(rootFile)) {
        filePath = path.join(ROOT, rootFile);
    } else if (!rootFile.includes('/') && JS_MODULES.has(rootFile)) {
        const rootModule = path.join(ROOT, rootFile);
        const nestedModule = path.join(ROOT, 'src', 'js', rootFile);
        filePath = fs.existsSync(rootModule) ? rootModule : nestedModule;
    } else {
        const moduleMatch = /^\/src\/js\/([^/]+\.js)$/.exec(urlPath);
        const moduleName = moduleMatch && moduleMatch[1];
        if (!moduleName || !JS_MODULES.has(moduleName)) {
            sendError(response, 404, 'Not Found');
            return;
        }

        const nestedModule = path.join(ROOT, 'src', 'js', moduleName);
        const rootModule = path.join(ROOT, moduleName);
        filePath = fs.existsSync(nestedModule) ? nestedModule : rootModule;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        sendError(response, 404, 'Not Found');
        return;
    }

    const extension = path.extname(filePath);
    const contentType = {
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.jpg': 'image/jpeg',
        '.js': 'text/javascript; charset=utf-8',
    }[extension] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    response.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length,
    });
    response.end(content);
}

function handleDatabaseError(response, error) {
    if (error.status) {
        sendJson(response, error.status, { error: error.message });
    } else if (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(error.message)) {
        sendJson(response, 409, { error: 'Ya existe un registro con ese identificador.' });
    } else {
        console.error(`Error de base de datos: ${error.message}`);
        sendJson(response, 500, { error: 'No se pudo completar la operación en la base de datos.' });
    }
}

async function handleRequest(request, response) {
    let urlPath;
    try {
        urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
        sendError(response, 400, 'La ruta de la solicitud no es válida.');
        return;
    }

    const parts = urlPath.split('/').filter(Boolean);
    try {
        if (request.method === 'GET' && urlPath === '/api/db') {
            const snapshot = Object.fromEntries(COLLECTIONS.map((name) => [name, []]));
            for (const row of database.prepare(
                'SELECT collection, data_json FROM records ORDER BY rowid',
            ).all()) {
                if (snapshot[row.collection]) snapshot[row.collection].push(JSON.parse(row.data_json));
            }
            sendJson(response, 200, snapshot);
            return;
        }

        if (request.method === 'GET' && parts.length === 3 && parts[0] === 'api' && parts[1] === 'collections') {
            const collection = requireCollection(parts[2]);
            const rows = database.prepare(
                'SELECT data_json FROM records WHERE collection = ? ORDER BY rowid',
            ).all(collection);
            sendJson(response, 200, rows.map((row) => JSON.parse(row.data_json)));
            return;
        }

        if (request.method === 'POST') {
            const data = await readJson(request);
            if (urlPath === '/api/db/import') {
                if (data === null || typeof data !== 'object' || Array.isArray(data)) {
                    const error = new Error('Los datos para importar deben ser un objeto.');
                    error.status = 400;
                    throw error;
                }
                inTransaction(() => {
                    const count = database.prepare('SELECT COUNT(*) AS count FROM records').get().count;
                    if (count) {
                        const error = new Error('La base de datos ya contiene información.');
                        error.status = 409;
                        throw error;
                    }
                    for (const collection of COLLECTIONS) {
                        const records = data[collection] ?? [];
                        if (!Array.isArray(records)) {
                            const error = new Error(`La colección ${collection} debe ser una lista.`);
                            error.status = 400;
                            throw error;
                        }
                        for (const record of records) insertRecord(collection, record);
                    }
                });
                sendJson(response, 201, { ok: true });
                return;
            }

            if (urlPath === '/api/reset') {
                database.exec('DELETE FROM records');
                sendJson(response, 200, true);
                return;
            }

            if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'collections') {
                const record = insertRecord(requireCollection(parts[2]), data);
                sendJson(response, 201, record);
                return;
            }

            sendJson(response, 404, { error: 'Ruta no encontrada.' });
            return;
        }

        if (request.method === 'PUT') {
            const data = await readJson(request);
            if (parts.length !== 4 || parts[0] !== 'api' || parts[1] !== 'collections') {
                sendJson(response, 404, { error: 'Ruta no encontrada.' });
                return;
            }
            if (data === null || typeof data !== 'object' || Array.isArray(data)) {
                const error = new Error('Los datos del registro deben ser un objeto.');
                error.status = 400;
                throw error;
            }
            const collection = requireCollection(parts[2]);
            const row = database.prepare(
                'SELECT data_json FROM records WHERE collection = ? AND record_id = ?',
            ).get(collection, parts[3]);
            if (!row) {
                sendJson(response, 200, null);
                return;
            }
            const record = { ...JSON.parse(row.data_json), ...data, updatedAt: nowIso() };
            database.prepare(
                'UPDATE records SET data_json = ?, updated_at = ? WHERE collection = ? AND record_id = ?',
            ).run(JSON.stringify(record), record.updatedAt, collection, parts[3]);
            sendJson(response, 200, record);
            return;
        }

        if (request.method === 'DELETE') {
            if (parts.length !== 4 || parts[0] !== 'api' || parts[1] !== 'collections') {
                sendJson(response, 404, { error: 'Ruta no encontrada.' });
                return;
            }
            const collection = requireCollection(parts[2]);
            const result = database.prepare(
                'DELETE FROM records WHERE collection = ? AND record_id = ?',
            ).run(collection, parts[3]);
            sendJson(response, 200, result.changes > 0);
            return;
        }

        if (request.method === 'GET' || request.method === 'HEAD') {
            serveStatic(response, urlPath);
            return;
        }

        sendJson(response, 404, { error: 'Ruta no encontrada.' });
    } catch (error) {
        handleDatabaseError(response, error);
    }
}

const server = createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
        console.error(`Error al procesar la solicitud: ${error.message}`);
        if (!response.headersSent) {
            sendJson(response, 500, { error: 'No se pudo completar la solicitud.' });
        } else {
            response.destroy(error);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor iniciado en el puerto ${PORT} (SQLite: ${DATABASE_PATH})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        server.close(() => {
            database.close();
            process.exit(0);
        });
    });
}
