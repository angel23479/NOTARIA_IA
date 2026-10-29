/**
 * db.js - Capa de acceso a datos.
 * Usa SQLite desde el servidor Node.js y conserva localStorage para el modo file://
 * y para sitios estáticos que no tengan habilitada la API.
 * Proporciona métodos CRUD y precarga registros de demostración (DEMO).
 */

(function () {
    const DB_NAME = 'notaria_chinchipe_db';
    const API_ENABLED = window.location.protocol !== 'file:' && (
        (['localhost', '127.0.0.1'].includes(window.location.hostname) &&
            window.location.port === '8080') ||
        window.location.hostname.endsWith('.onrender.com')
    );
    let remoteDatabase = false;

    // Esquema de colecciones por defecto
    const DEFAULT_SCHEMA = {
        users: [],
        clients: [],
        procedures: [],
        document_types: [],
        templates: [],
        documents: [],
        document_versions: [],
        notifications: [],
        audit_logs: [],
        ai_conversations: [],
        ai_messages: []
    };

    function requestDatabase(method, path, data) {
        const request = new XMLHttpRequest();
        request.open(method, `/api${path}`, false);
        if (data !== undefined) request.setRequestHeader('Content-Type', 'application/json');
        request.send(data === undefined ? null : JSON.stringify(data));

        if (request.status < 200 || request.status >= 300) {
            let message = `Error de base de datos (${request.status}).`;
            try {
                message = JSON.parse(request.responseText).error || message;
            } catch (error) {
                console.error('No se pudo interpretar la respuesta del servidor de base de datos.', error);
            }
            throw new Error(message);
        }
        return request.responseText ? JSON.parse(request.responseText) : null;
    }

    function saveLocalDatabase(db) {
        localStorage.setItem(DB_NAME, JSON.stringify(db));
    }

    // Inicializar la base persistente y migrar los datos locales cuando sea necesario.
    function initDB() {
        let raw = localStorage.getItem(DB_NAME);
        if (API_ENABLED) {
            const snapshot = requestDatabase('GET', '/db');
            const hasServerData = Object.values(snapshot).some(collection => collection.length > 0);

            if (hasServerData) {
                saveLocalDatabase(snapshot);
            } else {
                remoteDatabase = false;
                if (!raw) {
                    saveLocalDatabase(DEFAULT_SCHEMA);
                    seedDemoData();
                } else {
                    try {
                        const localData = JSON.parse(raw);
                        for (const key in DEFAULT_SCHEMA) {
                            if (!Array.isArray(localData[key])) localData[key] = [];
                        }
                    } catch (error) {
                        console.error('La base local del navegador no se pudo recuperar; se iniciarán datos de demostración.', error);
                        localStorage.removeItem(DB_NAME);
                        saveLocalDatabase(DEFAULT_SCHEMA);
                        seedDemoData();
                    }
                }
                requestDatabase('POST', '/db/import', JSON.parse(localStorage.getItem(DB_NAME)));
            }
            remoteDatabase = true;
            saveLocalDatabase(requestDatabase('GET', '/db'));
            return;
        }

        if (!raw) {
            localStorage.setItem(DB_NAME, JSON.stringify(DEFAULT_SCHEMA));
            seedDemoData();
        } else {
            // Verificar si todas las tablas del esquema existen
            try {
                const db = JSON.parse(raw);
                let modified = false;
                for (let key in DEFAULT_SCHEMA) {
                    if (!db[key]) {
                        db[key] = [];
                        modified = true;
                    }
                }
                if (modified) {
                    localStorage.setItem(DB_NAME, JSON.stringify(db));
                }
            } catch (e) {
                localStorage.setItem(DB_NAME, JSON.stringify(DEFAULT_SCHEMA));
                seedDemoData();
            }
        }
    }

    // Obtener toda la base de datos
    function getDB() {
        if (remoteDatabase) return requestDatabase('GET', '/db');
        const raw = localStorage.getItem(DB_NAME);
        try {
            return JSON.parse(raw) || DEFAULT_SCHEMA;
        } catch (e) {
            return DEFAULT_SCHEMA;
        }
    }

    // Guardar toda la base de datos
    function saveDB(db) {
        if (remoteDatabase) {
            requestDatabase('POST', '/db/import', db);
        } else {
            saveLocalDatabase(db);
        }
    }

    // --- MÉTODOS CRUD GENÉRICOS ---
    const dbInstance = {
        // Inicialización
        init: initDB,

        // Limpiar DB y restablecer semillas
        reset: function () {
            if (remoteDatabase) {
                requestDatabase('POST', '/reset', {});
                remoteDatabase = false;
            }
            localStorage.removeItem(DB_NAME);
            initDB();
        },

        // Obtener colección
        getCollection: function (name) {
            if (remoteDatabase) return requestDatabase('GET', `/collections/${encodeURIComponent(name)}`);
            return getDB()[name] || [];
        },

        // Buscar por id
        findById: function (collection, id) {
            const list = this.getCollection(collection);
            return list.find(item => item.id == id) || null;
        },

        // Buscar uno por atributo
        findOne: function (collection, query = {}) {
            const list = this.getCollection(collection);
            return list.find(item => {
                for (let key in query) {
                    if (item[key] !== query[key]) return false;
                }
                return true;
            }) || null;
        },

        // Buscar todos los que coincidan con consulta
        findMany: function (collection, query = {}) {
            const list = this.getCollection(collection);
            return list.filter(item => {
                for (let key in query) {
                    if (item[key] !== query[key]) return false;
                }
                return true;
            });
        },

        // Insertar un registro
        insert: function (collection, data) {
            if (remoteDatabase) {
                return requestDatabase('POST', `/collections/${encodeURIComponent(collection)}`, data);
            }
            const db = getDB();
            if (!db[collection]) db[collection] = [];

            const newItem = {
                id: data.id || Date.now() + Math.floor(Math.random() * 1000),
                createdAt: new Date().toISOString(),
                ...data
            };

            db[collection].push(newItem);
            saveDB(db);
            return newItem;
        },

        // Actualizar un registro
        update: function (collection, id, data) {
            if (remoteDatabase) {
                return requestDatabase('PUT', `/collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, data);
            }
            const db = getDB();
            if (!db[collection]) return null;

            const index = db[collection].findIndex(item => item.id == id);
            if (index === -1) return null;

            db[collection][index] = {
                ...db[collection][index],
                ...data,
                updatedAt: new Date().toISOString()
            };

            saveDB(db);
            return db[collection][index];
        },

        // Eliminar un registro
        delete: function (collection, id) {
            if (remoteDatabase) {
                return requestDatabase('DELETE', `/collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`) === true;
            }
            const db = getDB();
            if (!db[collection]) return false;

            const initialLength = db[collection].length;
            db[collection] = db[collection].filter(item => item.id != id);

            if (db[collection].length === initialLength) return false;

            saveDB(db);
            return true;
        }
    };

    // --- POBLACIÓN DE DATOS DE DEMOSTRACIÓN (SEEDS) ---
    function seedDemoData() {
        console.log("Precargando datos de demostración para Asistente Notarial...");

        // 1. Usuarios demo
        const demoUsers = [
            { id: 1, username: 'admin', password: 'password', fullname: 'Dr. Ramiro Toro (Admin)', role: 'ADMINISTRADOR', active: true },
            { id: 2, username: 'personal', password: 'password', fullname: 'Ing. Sofía Jumbo', role: 'PERSONAL_NOTARIAL', active: true },
            { id: 3, username: 'notario', password: 'password', fullname: 'Dr. Patricio Ordóñez (Notario)', role: 'NOTARIO', active: true }
        ];
        demoUsers.forEach(u => dbInstance.insert('users', u));

        // 2. Clientes ficticios (10 clientes de demostración)
        const demoClients = [
            { id: 101, cedula: '1900123454', names: 'Juan Carlos', surnames: 'Pérez Medina', dob: '1985-05-12', maritalStatus: 'SOLTERO', nationality: 'Ecuatoriana', address: 'Av. Progreso y Loja, Zumba', phone: '0987654321', email: 'juan.perez@example.com', notes: 'Cliente frecuente, agricultor de la zona.', createdAt: new Date(Date.now() - 30 * 86400000).toISOString() },
            { id: 102, cedula: '1104567894', names: 'María Augusta', surnames: 'Ortiz Cevallos', dob: '1990-11-23', maritalStatus: 'CASADO', nationality: 'Ecuatoriana', address: 'Calle 12 de Febrero, Zumba', phone: '0991234567', email: 'maria.ortiz@example.com', notes: 'Requiere agilidad en trámites por viaje.', createdAt: new Date(Date.now() - 25 * 86400000).toISOString() },
            { id: 103, cedula: '1723456784', names: 'José Vicente', surnames: 'Guerrero Silva', dob: '1972-04-05', maritalStatus: 'DIVORCIADO', nationality: 'Ecuatoriana', address: 'Barrio El Progreso, Chito', phone: '0982345678', email: 'jose.guerrero@example.com', notes: 'Propietario de finca cafetalera.', createdAt: new Date(Date.now() - 20 * 86400000).toISOString() },
            { id: 104, cedula: '1900876549', names: 'Ana Isabel', surnames: 'Jaramillo Torres', dob: '1993-08-15', maritalStatus: 'CASADO', nationality: 'Ecuatoriana', address: 'Calle Sucre y Bolívar, Zumba', phone: '0979876543', email: 'ana.jaramillo@example.com', notes: 'Trámite de compraventa en curso.', createdAt: new Date(Date.now() - 18 * 86400000).toISOString() },
            { id: 105, cedula: '0703456780', names: 'Carlos Alfredo', surnames: 'Valarezo Mendoza', dob: '1968-01-30', maritalStatus: 'VIUDO', nationality: 'Ecuatoriana', address: 'Sector San Francisco, Zumba', phone: '0988776655', email: 'carlos.valarezo@example.com', notes: 'Adulto mayor, exoneración de tasas.', createdAt: new Date(Date.now() - 15 * 86400000).toISOString() },
            { id: 106, cedula: '1900456128', names: 'Luis Humberto', surnames: 'Cabrera Masache', dob: '1982-06-25', maritalStatus: 'SOLTERO', nationality: 'Ecuatoriana', address: 'Parroquia La Chonta', phone: '0993456789', email: 'luis.cabrera@example.com', notes: 'Ninguna.', createdAt: new Date(Date.now() - 12 * 86400000).toISOString() },
            { id: 107, cedula: '1103214563', names: 'Diana Elizabeth', surnames: 'Maldonado Eras', dob: '1988-09-08', maritalStatus: 'CASADO', nationality: 'Ecuatoriana', address: 'Barrio Central, Zumba', phone: '0961234789', email: 'diana.maldonado@example.com', notes: 'Comerciante local.', createdAt: new Date(Date.now() - 10 * 86400000).toISOString() },
            { id: 108, cedula: '1712345675', names: 'Franklin Eduardo', surnames: 'Villalta Ochoa', dob: '1979-02-14', maritalStatus: 'SOLTERO', nationality: 'Ecuatoriana', address: 'Via El Chito Km 5', phone: '0958741236', email: 'franklin.villalta@example.com', notes: 'Solicitó poder especial para venta.', createdAt: new Date(Date.now() - 8 * 86400000).toISOString() },
            { id: 109, cedula: '1900789122', names: 'Martha Elena', surnames: 'Arias Sarango', dob: '1995-12-05', maritalStatus: 'SOLTERO', nationality: 'Ecuatoriana', address: 'Barrio Lindo, Zumba', phone: '0984512369', email: 'martha.arias@example.com', notes: 'Estudiante de derecho, trámite personal.', createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
            { id: 110, cedula: '1900112234', names: 'Víctor Manuel', surnames: 'Sánchez Gaona', dob: '1961-07-22', maritalStatus: 'CASADO', nationality: 'Ecuatoriana', address: 'Parroquia El Chito', phone: '0997451230', email: 'victor.sanchez@example.com', notes: 'Jubilado.', createdAt: new Date(Date.now() - 2 * 86400000).toISOString() }
        ];
        demoClients.forEach(c => dbInstance.insert('clients', c));

        // 3. Tipos de documentos (5 Tipos configurables iniciales)
        const demoDocTypes = [
            { id: 1, name: 'Poder Especial / General', description: 'Autorización legal otorgada a un tercero para gestionar asuntos legales o comerciales.', active: true },
            { id: 2, name: 'Declaración Juramentada', description: 'Manifestación escrita bajo juramento sobre hechos de conocimiento del declarante.', active: true },
            { id: 3, name: 'Autorización de Viaje de Menores', description: 'Permiso notarial que otorgan los padres para la salida del país de sus hijos.', active: true },
            { id: 4, name: 'Contrato de Compraventa Vehicular', description: 'Acuerdo de transferencia de propiedad de un vehículo automotor entre comparecientes.', active: true },
            { id: 5, name: 'Acta de Reconocimiento de Firma', description: 'Certificación notarial de que las firmas en un documento privado corresponden a los comparecientes.', active: true }
        ];
        demoDocTypes.forEach(dt => dbInstance.insert('document_types', dt));

        // 4. Plantillas iniciales con variables configuradas
        const demoTemplates = [
            {
                id: 201,
                name: 'Plantilla de Poder Especial',
                description: 'Poder especial estándar para representación judicial o administrativa en Zumba.',
                typeId: 1,
                version: '1.0',
                active: true,
                updatedAt: new Date(Date.now() - 15 * 86400000).toISOString(),
                updatedBy: 'Dr. Ramiro Toro (Admin)',
                variables: ['COMPARECIENTE', 'CEDULA_COMPARECIENTE', 'APODERADO', 'CEDULA_APODERADO', 'OBJETO_PODER', 'CIUDAD', 'FECHA'],
                content: `CONSTITUCIÓN DE PODER ESPECIAL
En la ciudad de {{CIUDAD}}, Cantón Chinchipe, Provincia de Zamora Chinchipe, República del Ecuador, a los {{FECHA}}, ante mí, Dr. Patricio Ordóñez, Notario Público de este Cantón, comparece de manera libre y voluntaria el/la señor(a) {{COMPARECIENTE}}, portador(a) de la cédula de ciudadanía No. {{CEDULA_COMPARECIENTE}}, de estado civil soltero, de nacionalidad ecuatoriana, domiciliado en este cantón, persona legalmente capaz para contratar y obligarse, a quien de conocer doy fe; y, manifiesta que otorga PODER ESPECIAL amplio y suficiente, cuanto en derecho sea necesario, a favor del/la señor(a) {{APODERADO}}, con cédula de ciudadanía No. {{CEDULA_APODERADO}}, para que en su nombre y representación realice las siguientes gestiones y actos administrativos:
-------------------------------------------------------------------------------------
{{OBJETO_PODER}}
-------------------------------------------------------------------------------------
El/la mandatario(a) queda facultado(a) para realizar todas las diligencias necesarias, firmar solicitudes, minutas, actas públicas y privadas relacionadas directamente con este encargo. El compareciente se ratifica en el contenido de este instrumento público.
Para constancia y validez, firma conjuntamente con el suscrito Notario.`
            },
            {
                id: 202,
                name: 'Plantilla de Declaración Juramentada',
                description: 'Declaración juramentada genérica de ingresos, convivencia u otros fines.',
                typeId: 2,
                version: '1.1',
                active: true,
                updatedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
                updatedBy: 'Dr. Ramiro Toro (Admin)',
                variables: ['COMPARECIENTE', 'CEDULA_COMPARECIENTE', 'ESTADO_CIVIL', 'DECLARACION', 'CIUDAD', 'FECHA'],
                content: `DECLARACIÓN JURAMENTADA
En la ciudad de {{CIUDAD}}, a los {{FECHA}}, comparece de manera libre y voluntaria ante mí, Notario del Cantón Chinchipe, el/la señor(a) {{COMPARECIENTE}}, portador(a) de la cédula de identidad No. {{CEDULA_COMPARECIENTE}}, de estado civil {{ESTADO_CIVIL}}, de ocupación comerciante, domiciliado(a) en el Cantón Chinchipe.
El compareciente, luego de haber sido advertido sobre la gravedad del juramento y las penas del perjurio, libre y voluntariamente declara bajo juramento lo siguiente:
-------------------------------------------------------------------------------------
{{DECLARACION}}
-------------------------------------------------------------------------------------
El declarante afirma que todo lo manifestado es la verdad y asume las responsabilidades legales que de esta declaración se deriven. Se ratifica en lo escrito, lo aprueba y firma conjuntamente con el Notario de Chinchipe.`
            },
            {
                id: 203,
                name: 'Plantilla de Autorización de Viaje',
                description: 'Autorización notarial para viaje de menor al exterior acompañado por un tercero.',
                typeId: 3,
                version: '1.0',
                active: true,
                updatedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
                updatedBy: 'Dr. Ramiro Toro (Admin)',
                variables: ['COMPARECIENTE', 'CEDULA_COMPARECIENTE', 'NOMBRE_MENOR', 'DESTINO', 'ACOMPANANTE', 'FECHA_VIAJE', 'CIUDAD', 'FECHA'],
                content: `AUTORIZACIÓN NOTARIAL DE VIAJE AL EXTERIOR
En la ciudad de {{CIUDAD}}, República del Ecuador, con fecha {{FECHA}}, ante mí comparece el/la señor(a) {{COMPARECIENTE}}, con cédula de ciudadanía No. {{CEDULA_COMPARECIENTE}}, en su calidad de progenitor(a) y en ejercicio de la patria potestad del menor de edad: {{NOMBRE_MENOR}}.
El compareciente manifiesta su voluntad de AUTORIZAR de forma expresa y libre la salida del país de su hijo(a) menor de edad antes mencionado, con destino a: {{DESTINO}}, para lo cual viajará en compañía del/la señor(a) {{ACOMPANANTE}}, programando el viaje de ida para la fecha {{FECHA_VIAJE}}.
Esta autorización se concede de conformidad con el Código de la Niñez y Adolescencia del Ecuador, solicitando a las autoridades de migración del país facilitar el libre tránsito del menor con el acompañante autorizado.
Leída y aprobada, firma el compareciente.`
            },
            {
                id: 204,
                name: 'Plantilla de Compraventa Vehicular',
                description: 'Minuta de contrato de compraventa para transferencia de dominio de automotores.',
                typeId: 4,
                version: '1.2',
                active: true,
                updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
                updatedBy: 'Dr. Ramiro Toro (Admin)',
                variables: ['VENDEDOR', 'CEDULA_VENDEDOR', 'COMPRADOR', 'CEDULA_COMPRADOR', 'MARCA_VEHICULO', 'PLACA', 'PRECIO', 'CIUDAD', 'FECHA'],
                content: `CONTRATO PRIVADO DE COMPRAVENTA DE VEHÍCULO
Conste por el presente instrumento que se suscribe en la ciudad de {{CIUDAD}}, el {{FECHA}}, al tenor de las siguientes cláusulas:
PRIMERA: COMPARECIENTES.- Intervienen por una parte el/la señor(a) {{VENDEDOR}}, con cédula No. {{CEDULA_VENDEDOR}}, de estado civil soltero, a quien se llamará el VENDEDOR; y por otra parte el/la señor(a) {{COMPRADOR}}, con cédula No. {{CEDULA_COMPRADOR}}, de estado civil casado, a quien se llamará el COMPRADOR.
SEGUNDA: OBJETO DEL CONTRATO.- El Vendedor transfiere en venta real y perpetua en favor del Comprador el vehículo de su propiedad con las siguientes características:
- Marca: {{MARCA_VEHICULO}}
- Placas: {{PLACA}}
TERCERA: PRECIO.- El precio pactado libremente por las partes por la venta del vehículo es de {{PRECIO}} DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA, los cuales el Vendedor declara recibir a su entera satisfacción en moneda de curso legal.
Para constancia de su acuerdo, las partes firman el presente contrato por triplicado ante el Notario del Cantón Chinchipe para su reconocimiento de firmas.`
            },
            {
                id: 205,
                name: 'Plantilla de Acta de Reconocimiento de Firma',
                description: 'Acta de diligencia notarial para reconocimiento de firmas en documentos privados.',
                typeId: 5,
                version: '1.0',
                active: true,
                updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
                updatedBy: 'Dr. Ramiro Toro (Admin)',
                variables: ['COMPARECIENTE', 'CEDULA_COMPARECIENTE', 'DOCUMENTO_PRIVADO', 'CIUDAD', 'FECHA'],
                content: `ACTA DE RECONOCIMIENTO DE FIRMA Y RÚBRICA
En la ciudad de {{CIUDAD}}, Cantón Chinchipe, Provincia de Zamora Chinchipe, República del Ecuador, con fecha {{FECHA}}, ante mí, Notario del Cantón Chinchipe, comparece el/la señor(a) {{COMPARECIENTE}}, portador(a) de la cédula No. {{CEDULA_COMPARECIENTE}}, persona de mi conocimiento y civilmente capaz.
El compareciente exhibe un documento privado denominado: "{{DOCUMENTO_PRIVADO}}", y en mi presencia declara bajo juramento que la firma y rúbrica constantes en dicho documento son las suyas propias, las mismas que utiliza en sus actos públicos y privados por ser de su puño y letra.
En consecuencia, el suscrito Notario certifica la autenticidad de la firma constante en el referido documento.
Leída esta acta y enterado el compareciente de su objeto, la firma conmigo.`
            }
        ];
        demoTemplates.forEach(t => dbInstance.insert('templates', t));

        // 5. Trámites de ejemplo (10 trámites en diferentes estados)
        const demoProcedures = [
            { id: 301, code: 'TRA-2026-0001', clientId: 101, typeId: 1, date: '2026-07-01', userId: 2, status: 'Finalizado' },
            { id: 302, code: 'TRA-2026-0002', clientId: 102, typeId: 2, date: '2026-07-05', userId: 2, status: 'Aprobado' },
            { id: 303, code: 'TRA-2026-0003', clientId: 103, typeId: 1, date: '2026-07-10', userId: 2, status: 'Borrador generado' },
            { id: 304, code: 'TRA-2026-0004', clientId: 104, typeId: 4, date: '2026-07-12', userId: 2, status: 'En revisión' },
            { id: 305, code: 'TRA-2026-0005', clientId: 105, typeId: 2, date: '2026-07-15', userId: 2, status: 'Rechazado' },
            { id: 306, code: 'TRA-2026-0006', clientId: 106, typeId: 3, date: '2026-07-20', userId: 2, status: 'En proceso' },
            { id: 307, code: 'TRA-2026-0007', clientId: 107, typeId: 5, date: '2026-07-22', userId: 2, status: 'Pendiente' },
            { id: 308, code: 'TRA-2026-0008', clientId: 108, typeId: 1, date: '2026-07-25', userId: 2, status: 'Borrador generado' },
            { id: 309, code: 'TRA-2026-0009', clientId: 109, typeId: 2, date: '2026-07-28', userId: 2, status: 'En revisión' },
            { id: 310, code: 'TRA-2026-0010', clientId: 110, typeId: 4, date: '2026-07-30', userId: 2, status: 'Pendiente' }
        ];
        demoProcedures.forEach(p => dbInstance.insert('procedures', p));

        // 6. Documentos en diferentes estados asociados a los trámites
        const demoDocs = [
            {
                id: 401,
                procedureId: 301,
                templateId: 201,
                title: 'Borrador de Poder Especial - Juan Pérez',
                content: `CONSTITUCIÓN DE PODER ESPECIAL\nEn la ciudad de Zumba, Cantón Chinchipe, Provincia de Zamora Chinchipe, República del Ecuador, a los 01 de Julio de 2026, ante mí, Dr. Patricio Ordóñez, Notario Público de este Cantón, comparece de manera libre y voluntaria el/la señor(a) Juan Carlos Pérez Medina, portador(a) de la cédula de ciudadanía No. 1900123454, de estado civil soltero, de nacionalidad ecuatoriana, domiciliado en este cantón, persona legalmente capaz para contratar y obligarse, a quien de conocer doy fe; y, manifiesta que otorga PODER ESPECIAL amplio y suficiente, cuanto en derecho sea necesario, a favor del/la señor(a) Manuel Agustín Cabrera, con cédula de ciudadanía No. 1900444555, para que en su nombre y representación realice las siguientes gestiones y actos administrativos:\n-------------------------------------------------------------------------------------\nAdministrar la venta del lote de terreno No. 4 ubicado en la Parroquia Zumba, fijando precios y firmando escrituras.\n-------------------------------------------------------------------------------------\nEl/la mandatario(a) queda facultado(a) para realizar todas las diligencias necesarias, firmar solicitudes, minutas, actas públicas y privadas relacionadas directamente con este encargo. El compareciente se ratifica en el contenido de este instrumento público.\nPara constancia y validez, firma conjuntamente con el suscrito Notario.`,
                status: 'aprobado',
                corrections: ''
            },
            {
                id: 402,
                procedureId: 302,
                templateId: 202,
                title: 'Declaración Juramentada de Ingresos - María Ortiz',
                content: `DECLARACIÓN JURAMENTADA\nEn la ciudad de Zumba, a los 05 de Julio de 2026, comparece de manera libre y voluntaria ante mí, Notario del Cantón Chinchipe, el/la señor(a) María Augusta Ortiz Cevallos, portador(a) de la cédula de identidad No. 1104567894, de estado civil CASADO, de ocupación comerciante, domiciliado(a) en el Cantón Chinchipe.\nEl compareciente, luego de haber sido advertido sobre la gravedad del juramento y las penas del perjurio, libre y voluntariamente declara bajo juramento lo siguiente:\n-------------------------------------------------------------------------------------\nQue percibe ingresos mensuales aproximados de USD 800 (Ochocientos dólares de los Estados Unidos de América) provenientes de su negocio propio de venta de artesanías en la calle central de Zumba.\n-------------------------------------------------------------------------------------\nEl declarante afirma que todo lo manifestado es la verdad y asume las responsabilidades legales que de esta declaración se deriven. Se ratifica en lo escrito, lo aprueba y firma conjuntamente con el Notario de Chinchipe.`,
                status: 'aprobado',
                corrections: ''
            },
            {
                id: 403,
                procedureId: 304,
                templateId: 204,
                title: 'Borrador de Compraventa Vehicular - Ana Jaramillo',
                content: `CONTRATO PRIVADO DE COMPRAVENTA DE VEHÍCULO\nConste por el presente instrumento que se suscribe en la ciudad de Zumba, el 12 de Julio de 2026, al tenor de las siguientes cláusulas:\nPRIMERA: COMPARECIENTES.- Intervienen por una parte el/la señor(a) Ana Isabel Jaramillo Torres, con cédula No. 1900876549, de estado civil casado, a quien se llamará el VENDEDOR; y por otra parte el/la señor(a) Pedro Francisco Cueva, con cédula No. 1103332221, de estado civil casado, a quien se llamará el COMPRADOR.\nSEGUNDA: OBJETO DEL CONTRATO.- El Vendedor transfiere en venta real y perpetua en favor del Comprador el vehículo de su propiedad con las siguientes características:\n- Marca: Chevrolet Vitara\n- Placas: ZBA-1234\nTERCERA: PRECIO.- El precio pactado libremente por las partes por la venta del vehículo es de 12000 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA, los cuales el Vendedor declara recibir a su entera satisfacción en moneda de curso legal.\nPara constancia de su acuerdo, las partes firman el presente contrato por triplicado ante el Notario del Cantón Chinchipe para su reconocimiento de firmas.`,
                status: 'revision',
                corrections: ''
            },
            {
                id: 404,
                procedureId: 305,
                templateId: 202,
                title: 'Declaración Juramentada de Convivencia - Carlos Valarezo',
                content: `DECLARACIÓN JURAMENTADA\nEn la ciudad de Zumba, a los 15 de Julio de 2026, comparece de manera libre y voluntaria ante mí, Notario del Cantón Chinchipe, el/la señor(a) Carlos Alfredo Valarezo Mendoza, portador(a) de la cédula de identidad No. 0703456780, de estado civil VIUDO, de ocupación comerciante, domiciliado(a) en el Cantón Chinchipe.\nEl compareciente, luego de haber sido advertido sobre la gravedad del juramento y las penas del perjurio, libre y voluntariamente declara bajo juramento lo siguiente:\n-------------------------------------------------------------------------------------\nQue convive en unión de hecho con la señora Teresa de Jesús Morocho desde hace 5 años en su domicilio en el sector San Francisco.\n-------------------------------------------------------------------------------------\nEl declarante afirma que todo lo manifestado es la verdad y asume las responsabilidades legales que de esta declaración se deriven. Se ratifica en lo escrito, lo aprueba y firma conjuntamente con el Notario de Chinchipe.`,
                status: 'rechazado',
                corrections: 'Corregir información del compareciente. Verificar estado civil de su pareja.'
            },
            {
                id: 405,
                procedureId: 309,
                templateId: 202,
                title: 'Declaración Juramentada de No Poseer Bienes - Martha Arias',
                content: `DECLARACIÓN JURAMENTADA\nEn la ciudad de Zumba, a los 28 de Julio de 2026, comparece de manera libre y voluntaria ante mí, Notario del Cantón Chinchipe, el/la señor(a) Martha Elena Arias Sarango, portador(a) de la cédula de identidad No. 1900789122, de estado civil SOLTERO, de ocupación estudiante, domiciliado(a) en el Cantón Chinchipe.\nEl compareciente, luego de haber sido advertido sobre la gravedad del juramento y las penas del perjurio, libre y voluntariamente declara bajo juramento lo siguiente:\n-------------------------------------------------------------------------------------\nQue no posee ningún bien inmueble registrado a su nombre en la provincia de Zamora Chinchipe ni en el resto del territorio ecuatoriano.\n-------------------------------------------------------------------------------------\nEl declarante afirma que todo lo manifestado es la verdad y asume las responsabilidades legales que de esta declaración se deriven. Se ratifica en lo escrito, lo aprueba y firma conjuntamente con el Notario de Chinchipe.`,
                status: 'revision',
                corrections: ''
            }
        ];
        demoDocs.forEach(d => dbInstance.insert('documents', d));

        // 7. Registro de logs de auditoría iniciales
        const demoLogs = [
            { userId: 1, username: 'admin', role: 'ADMINISTRADOR', action: 'INICIO_SESION', timestamp: new Date(Date.now() - 3 * 3600000).toISOString(), details: 'Usuario admin inició sesión desde panel central.', ip: '192.168.10.2' },
            { userId: 2, username: 'personal', role: 'PERSONAL_NOTARIAL', action: 'INICIO_SESION', timestamp: new Date(Date.now() - 2.5 * 3600000).toISOString(), details: 'Usuario personal inició sesión.', ip: '192.168.10.15' },
            { userId: 2, username: 'personal', role: 'PERSONAL_NOTARIAL', action: 'CREACION_CLIENTE', timestamp: new Date(Date.now() - 2.2 * 3600000).toISOString(), details: 'Creación de cliente demo Víctor Manuel Sánchez.', ip: '192.168.10.15' },
            { userId: 2, username: 'personal', role: 'PERSONAL_NOTARIAL', action: 'CREACION_TRAMITE', timestamp: new Date(Date.now() - 2.1 * 3600000).toISOString(), details: 'Creó trámite TRA-2026-0010 de compraventa.', ip: '192.168.10.15' },
            { userId: 3, username: 'notario', role: 'NOTARIO', action: 'INICIO_SESION', timestamp: new Date(Date.now() - 1 * 3600000).toISOString(), details: 'El Notario inició sesión en el sistema.', ip: '192.168.10.5' },
            { userId: 3, username: 'notario', role: 'NOTARIO', action: 'APROBACION_DOCUMENTO', timestamp: new Date(Date.now() - 0.5 * 3600000).toISOString(), details: 'El Notario aprobó el borrador de declaración de María Ortiz.', ip: '192.168.10.5' }
        ];
        demoLogs.forEach(l => dbInstance.insert('audit_logs', l));

        // 8. Notificaciones de ejemplo
        const demoNotifications = [
            { userId: 3, message: 'Nuevo documento de compraventa (TRA-2026-0004) pendiente de revisión.', read: false, createdAt: new Date(Date.now() - 5 * 3600000).toISOString() },
            { userId: 2, message: 'Documento (TRA-2026-0005) rechazado por el Notario. Requiere corrección.', read: false, createdAt: new Date(Date.now() - 4 * 3600000).toISOString() },
            { userId: 2, message: 'Documento (TRA-2026-0002) aprobado por el Notario.', read: true, createdAt: new Date(Date.now() - 0.5 * 3600000).toISOString() }
        ];
        demoNotifications.forEach(n => dbInstance.insert('notifications', n));
    }

    // Registrar en objeto global window
    window.db = dbInstance;

    // Inicializar inmediatamente
    initDB();
})();
