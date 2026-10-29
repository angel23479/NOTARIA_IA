/**
 * templates.js - Módulo de Gestión de Plantillas
 * Permite administrar el catálogo de plantillas de documentos notariales y sus variables dinámicas.
 */

(function() {
    const templatesModule = {
        // Llenar selectores de tipos de documentos en el formulario de plantillas
        populateDocTypes: function() {
            const select = document.getElementById('template-form-type');
            if (select) {
                select.innerHTML = '<option value="">-- Seleccione Tipo de Documento --</option>';
                const docTypes = window.db.getCollection('document_types');
                docTypes.forEach(dt => {
                    select.innerHTML += `<option value="${dt.id}">${dt.name}</option>`;
                });
            }
        },

        // Renderizar catálogo de plantillas
        renderList: function() {
            const catalogContainer = document.getElementById('templates-catalog-grid');
            if (!catalogContainer) return;

            const templates = window.db.getCollection('templates');
            const docTypes = window.db.getCollection('document_types');
            const currentUser = window.auth.getCurrentUser();
            const isAdmin = currentUser && currentUser.role === 'ADMINISTRADOR';

            if (templates.length === 0) {
                catalogContainer.innerHTML = `<div class="col-span-full empty-state"><p>No existen documentos configurados.</p></div>`;
                return;
            }

            catalogContainer.innerHTML = templates.map(t => {
                const docType = docTypes.find(dt => dt.id == t.typeId);
                const variablesHtml = t.variables.map(v => `<span class="variable-badge">\${${v}}</span>`).join(' ');
                
                return `
                    <div class="card template-card ${t.active ? '' : 'inactive'}">
                        <div class="template-card-header">
                            <span class="badge ${t.active ? 'badge-success' : 'badge-danger'}">
                                ${t.active ? 'Activa' : 'Inactiva'}
                            </span>
                            <span class="template-version">v${t.version || '1.0'}</span>
                        </div>
                        <h3 class="template-title">${t.name.replace(/^Plantilla\s+de\s+/i, '')}</h3>
                        <p class="template-desc">${t.description}</p>
                        <div class="template-type">
                            <strong>Trámite:</strong> ${docType ? docType.name : 'No asignado'}
                        </div>
                        <div class="template-variables-list">
                            <strong>Variables:</strong>
                            <div class="variables-flex">${variablesHtml}</div>
                        </div>
                        <div class="template-footer-info">
                            <span>Modificado por: ${t.updatedBy || 'N/D'}</span>
                            <span>Fecha: ${t.updatedAt ? new Date(t.updatedAt).toLocaleDateString('es-ES') : 'N/D'}</span>
                        </div>
                        ${isAdmin ? `
                            <div class="template-actions">
                                <button class="btn btn-secondary btn-sm" onclick="templates.openEditForm(${t.id})">✏️ Editar</button>
                                <button class="btn btn-text btn-sm ${t.active ? 'text-error' : 'text-success'}" onclick="templates.toggleStatus(${t.id})">
                                    ${t.active ? 'Desactivar' : 'Activar'}
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        },

        // Guardar Plantilla (Nueva / Editar)
        saveTemplate: function(event) {
            if (event) event.preventDefault();

            const currentUser = window.auth.getCurrentUser();
            if (!currentUser) return;

            const idInput = document.getElementById('template-form-id');
            const nameInput = document.getElementById('template-form-name');
            const descInput = document.getElementById('template-form-desc');
            const typeSelect = document.getElementById('template-form-type');
            const versionInput = document.getElementById('template-form-version');
            const activeSelect = document.getElementById('template-form-active');
            const variablesInput = document.getElementById('template-form-variables');
            const contentInput = document.getElementById('template-form-content');

            const id = idInput.value;
            const name = nameInput.value.trim();
            const description = descInput.value.trim();
            const typeId = parseInt(typeSelect.value, 10);
            const version = versionInput.value.trim() || '1.0';
            const active = activeSelect.value === 'true';
            const content = contentInput.value;

            // Procesar variables (separadas por comas, eliminar espacios y llaves si el usuario las ingresó)
            const variables = variablesInput.value
                .split(',')
                .map(v => v.replace(/[{}]/g, '').trim().toUpperCase())
                .filter(v => v.length > 0);

            if (!name || !typeId || !content) {
                window.app.showToast('⚠️ Nombre, Tipo de Trámite y Contenido son campos obligatorios.', 'warning');
                return;
            }

            const templateData = {
                name,
                description,
                typeId,
                version,
                active,
                content,
                variables,
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser.fullname
            };

            if (id) {
                // Editar plantilla
                window.db.update('templates', id, templateData);
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'EDICION_PLANTILLA',
                    timestamp: new Date().toISOString(),
                    details: `Editó la plantilla "${name}" (v${version})`,
                    ip: '192.168.10.15'
                });
                window.app.showToast('✅ Documento actualizado correctamente.', 'success');
            } else {
                // Crear plantilla
                window.db.insert('templates', templateData);
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'CREACION_PLANTILLA',
                    timestamp: new Date().toISOString(),
                    details: `Creó una nueva plantilla "${name}" (v${version})`,
                    ip: '192.168.10.15'
                });
                window.app.showToast('✅ Documento creado con éxito.', 'success');
            }

            this.clearForm();
            window.app.navigateTo('view-templates');
        },

        // Cargar plantilla en edición
        openEditForm: function(id) {
            const t = window.db.findById('templates', id);
            if (!t) return;

            window.app.navigateTo('view-templates-new');
            this.populateDocTypes();

            document.getElementById('template-form-title').textContent = 'Editar Documento';
            document.getElementById('template-form-id').value = t.id;
            document.getElementById('template-form-name').value = t.name.replace(/^Plantilla\s+de\s+/i, '');
            document.getElementById('template-form-desc').value = t.description;
            document.getElementById('template-form-type').value = t.typeId;
            document.getElementById('template-form-version').value = t.version || '1.0';
            document.getElementById('template-form-active').value = t.active ? 'true' : 'false';
            document.getElementById('template-form-variables').value = t.variables.join(', ');
            document.getElementById('template-form-content').value = t.content;
        },

        // Cambiar estado activo/inactivo rápidamente
        toggleStatus: function(id) {
            const t = window.db.findById('templates', id);
            if (!t) return;

            const currentUser = window.auth.getCurrentUser();
            const newStatus = !t.active;
            
            window.db.update('templates', id, { active: newStatus });

            window.db.insert('audit_logs', {
                userId: currentUser.id,
                username: currentUser.username,
                role: currentUser.role,
                action: 'ESTADO_PLANTILLA',
                timestamp: new Date().toISOString(),
                details: `Cambió el estado de la plantilla "${t.name}" a ${newStatus ? 'ACTIVA' : 'INACTIVA'}.`,
                ip: '192.168.10.15'
            });

            window.app.showToast(`✅ Documento ${newStatus ? 'activado' : 'desactivado'} correctamente.`, 'success');
            this.renderList();
        },

        // Limpiar el formulario
        clearForm: function() {
            document.getElementById('template-form-title').textContent = 'Crear nuevo documento';
            document.getElementById('template-form-id').value = '';
            document.getElementById('template-form-name').value = '';
            document.getElementById('template-form-desc').value = '';
            document.getElementById('template-form-type').value = '';
            document.getElementById('template-form-version').value = '1.0';
            document.getElementById('template-form-active').value = 'true';
            document.getElementById('template-form-variables').value = 'COMPARECIENTE, CEDULA_COMPARECIENTE, CIUDAD, FECHA';
            document.getElementById('template-form-content').value = '';
        }
    };

    window.templates = templatesModule;
})();
