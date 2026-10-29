/**
 * auth.js - Gestión de Sesiones y Control de Accesos por Roles
 * Administra el estado de autenticación de usuario y los roles del sistema.
 */

(function() {
    const SESSION_KEY = 'notaria_chinchipe_session';

    const authInstance = {
        // Obtener usuario actualmente autenticado
        getCurrentUser: function() {
            const session = sessionStorage.getItem(SESSION_KEY);
            if (!session) return null;
            try {
                return JSON.parse(session);
            } catch (e) {
                return null;
            }
        },

        // Iniciar sesión
        login: function(username, password) {
            // Cargar usuarios desde la base de datos
            const loginValue = username.trim();
            const user = window.db.findOne('users', { username: loginValue, active: true }) ||
                window.db.findOne('users', { email: loginValue.toLowerCase(), active: true });
            
            if (!user) {
                throw new Error('El usuario no existe o está inactivo.');
            }
            
            // Simulación simple de contraseña
            if (user.password !== password) {
                throw new Error('Contraseña incorrecta.');
            }
            
            // Crear sesión (simulación de token JWT guardando datos seguros del usuario)
            const sessionUser = {
                id: user.id,
                username: user.username,
                fullname: user.fullname,
                role: user.role,
                clientId: user.clientId,
                token: 'mock-jwt-token-' + Math.random().toString(36).substring(2)
            };
            
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
            
            // Registrar en auditoría
            window.db.insert('audit_logs', {
                userId: user.id,
                username: user.username,
                role: user.role,
                action: 'INICIO_SESION',
                timestamp: new Date().toISOString(),
                details: `Usuario ${user.username} inició sesión en el sistema.`,
                ip: '192.168.10.' + Math.floor(Math.random() * 20 + 2)
            });
            
            return sessionUser;
        },

        // Crear cuenta local de solicitante para el prototipo; no vincula expedientes existentes.
        registerApplicant: function({ names, surnames, cedula, email, password }) {
            const cleanNames = names.trim();
            const cleanSurnames = surnames.trim();
            const cleanCedula = cedula.trim();
            const normalizedEmail = email.trim().toLowerCase();

            if (!cleanNames || !cleanSurnames || !cleanCedula || !normalizedEmail || !password) {
                throw new Error('Complete todos los campos del formulario.');
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                throw new Error('Ingrese un correo electrónico válido.');
            }
            if (!window.clients.isValidCedula(cleanCedula)) {
                throw new Error('La cédula ecuatoriana no es válida.');
            }
            if (password.length < 8) {
                throw new Error('La contraseña debe tener al menos 8 caracteres.');
            }
            const duplicateEmail = window.db.getCollection('users').some(user =>
                [user.email, user.username].some(value =>
                    String(value || '').trim().toLowerCase() === normalizedEmail
                )
            );
            if (duplicateEmail) {
                throw new Error('Ya existe una cuenta con ese correo electrónico.');
            }
            if (window.db.findOne('clients', { cedula: cleanCedula })) {
                throw new Error('Esta cédula ya está registrada. En este prototipo no se permite vincular cuentas a expedientes existentes.');
            }

            const client = window.db.insert('clients', {
                cedula: cleanCedula,
                names: cleanNames,
                surnames: cleanSurnames,
                nationality: 'Ecuatoriana',
                email: normalizedEmail,
                notes: 'Perfil creado desde el formulario local de demostración.'
            });
            return window.db.insert('users', {
                username: normalizedEmail,
                email: normalizedEmail,
                password,
                fullname: `${cleanNames} ${cleanSurnames}`,
                role: 'USUARIO',
                clientId: client.id,
                active: true
            });
        },

        // Cerrar sesión
        logout: function() {
            const user = this.getCurrentUser();
            try {
                if (user) {
                    window.db.insert('audit_logs', {
                        userId: user.id,
                        username: user.username,
                        role: user.role,
                        action: 'CERRAR_SESION',
                        timestamp: new Date().toISOString(),
                        details: `Usuario ${user.username} cerró sesión.`,
                        ip: '192.168.10.15'
                    });
                }
            } catch (error) {
                console.error('No se pudo registrar el cierre de sesión en auditoría.', error);
                throw new Error(`La sesión se cerró, pero no se pudo guardar la auditoría: ${error.message}`);
            } finally {
                sessionStorage.removeItem(SESSION_KEY);
            }
        },

        // Verificar si el usuario tiene rol requerido
        hasRole: function(allowedRoles = []) {
            const user = this.getCurrentUser();
            if (!user) return false;
            return allowedRoles.includes(user.role);
        },

        // Forzar cambio de rol rápido para testing (Modo Demo)
        debugSwitchRole: function(role) {
            const currentUser = this.getCurrentUser();
            if (!currentUser || (currentUser.role !== 'ADMINISTRADOR' && currentUser.debugAccess !== true)) {
                return null;
            }

            const userMap = {
                'ADMINISTRADOR': { id: 1, username: 'admin', fullname: 'Dr. Ramiro Toro (Admin)', role: 'ADMINISTRADOR' },
                'PERSONAL_NOTARIAL': { id: 2, username: 'personal', fullname: 'Ing. Sofía Jumbo', role: 'PERSONAL_NOTARIAL' },
                'NOTARIO': { id: 3, username: 'notario', fullname: 'Dr. Patricio Ordóñez (Notario)', role: 'NOTARIO' }
            };
            
            const selected = userMap[role];
            if (selected) {
                const sessionUser = {
                    ...selected,
                    debugAccess: true,
                    token: 'debug-role-switch-' + role
                };
                sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
                
                // Registrar auditoría de switch
                window.db.insert('audit_logs', {
                    userId: selected.id,
                    username: selected.username,
                    role: selected.role,
                    action: 'CAMBIO_ROL_DEBUG',
                    timestamp: new Date().toISOString(),
                    details: `Cambiado de rol a ${role} para pruebas rápidas.`,
                    ip: '127.0.0.1'
                });
                
                return sessionUser;
            }
            return null;
        }
    };

    window.auth = authInstance;
})();
