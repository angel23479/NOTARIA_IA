/**
 * procedures.js - Módulo de Gestión de Trámites
 * Administra el ciclo de vida de los trámites notariales, estados, filtros y vinculación documental.
 */

(function() {
    const proceduresModule = {
        // Generar un código único correlativo para trámites
        generateCode: function() {
            const list = window.db.getCollection('procedures');
            const year = new Date().getFullYear();
            
            // Obtener el número máximo correlativo del año actual
            let maxNum = 0;
            const prefix = `TRA-${year}-`;
            
            list.forEach(p => {
                if (p.code && p.code.startsWith(prefix)) {
                    const numPart = parseInt(p.code.substring(prefix.length), 10);
                    if (numPart > maxNum) maxNum = numPart;
                }
            });

            const nextNum = maxNum + 1;
            // Pad start to 4 digits (e.g., 0001)
            const padded = nextNum.toString().padStart(4, '0');
            return `${prefix}${padded}`;
        },

        // Llenar los selectores de tipo de trámite y clientes en los formularios
        populateSelectors: function() {
            // Clientes
            const clientSelect = document.getElementById('procedure-form-client');
            if (clientSelect) {
                clientSelect.innerHTML = '<option value="">-- Seleccione un Cliente --</option>';
                const clients = window.db.getCollection('clients');
                clients.forEach(c => {
                    clientSelect.innerHTML += `<option value="${c.id}">${c.surnames} ${c.names} (${c.cedula})</option>`;
                });
            }

            // Tipos de Documentos
            const typeSelect = document.getElementById('procedure-form-type');
            if (typeSelect) {
                typeSelect.innerHTML = '<option value="">-- Seleccione Tipo de Documento --</option>';
                const docTypes = window.db.getCollection('document_types').filter(dt => dt.active);
                docTypes.forEach(dt => {
                    typeSelect.innerHTML += `<option value="${dt.id}">${dt.name}</option>`;
                });
            }

            // Tipos de Documentos en filtros de búsqueda
            const filterType = document.getElementById('filter-procedure-type');
            if (filterType) {
                filterType.innerHTML = '<option value="">Todos los tipos</option>';
                const docTypes = window.db.getCollection('document_types');
                docTypes.forEach(dt => {
                    filterType.innerHTML += `<option value="${dt.id}">${dt.name}</option>`;
                });
            }
        },

        // Renderizar listado de trámites con filtros
        renderList: function() {
            const listContainer = document.getElementById('procedures-table-body');
            if (!listContainer) return;

            const allProcedures = window.db.getCollection('procedures');
            const clients = window.db.getCollection('clients');
            const docTypes = window.db.getCollection('document_types');

            // Leer filtros
            const filterStatus = document.getElementById('filter-procedure-status')?.value;
            const filterType = document.getElementById('filter-procedure-type')?.value;
            const filterDate = document.getElementById('filter-procedure-date')?.value;
            const filterSearch = document.getElementById('filter-procedure-search')?.value?.trim()?.toLowerCase();

            const filtered = allProcedures.filter(p => {
                // Filtro Estado
                if (filterStatus && p.status !== filterStatus) return false;
                
                // Filtro Tipo Documento
                if (filterType && p.typeId != filterType) return false;
                
                // Filtro Fecha
                if (filterDate && p.date !== filterDate) return false;

                // Filtro búsqueda global (cédula, nombre cliente o código)
                if (filterSearch) {
                    const client = clients.find(c => c.id == p.clientId);
                    const clientMatch = client && (
                        client.cedula.includes(filterSearch) ||
                        client.names.toLowerCase().includes(filterSearch) ||
                        client.surnames.toLowerCase().includes(filterSearch)
                    );
                    const codeMatch = p.code.toLowerCase().includes(filterSearch);
                    return clientMatch || codeMatch;
                }

                return true;
            });

            if (filtered.length === 0) {
                listContainer.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center py-8 text-secondary">
                            No se encontraron trámites con los filtros aplicados.
                        </td>
                    </tr>`;
                return;
            }

            // Ordenar por fecha descendente
            filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

            listContainer.innerHTML = filtered.map(p => {
                const client = clients.find(c => c.id == p.clientId);
                const docType = docTypes.find(dt => dt.id == p.typeId);
                const statusClass = window.app.getStatusClass(p.status);
                const clientName = client ? `${client.surnames} ${client.names}` : 'Cliente no encontrado';
                const documentTypeName = docType ? docType.name : 'No asignado';
                
                return `
                    <tr>
                        <td><strong>${p.code}</strong></td>
                        <td>${clientName}</td>
                        <td>${documentTypeName}</td>
                        <td>${new Date(p.date).toLocaleDateString('es-ES')}</td>
                        <td><span class="badge ${statusClass}">${p.status}</span></td>
                        <td class="table-actions">
                            <button class="btn btn-text btn-sm" onclick="app.viewProcedureDetail(${p.id})" title="Ver Trámite">👁️ Detalle</button>
                            <button class="btn btn-text btn-sm" onclick="procedures.editProcedure(${p.id})" title="Editar Trámite">✏️ Editar</button>
                            ${p.status !== 'Finalizado' ? `<button class="btn btn-text btn-sm text-error" onclick="procedures.deleteProcedure(${p.id})" title="Eliminar Trámite">🗑️</button>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        },

        // Registrar / Guardar Trámite
        saveProcedure: function(event) {
            if (event) event.preventDefault();

            const currentUser = window.auth.getCurrentUser();
            if (!currentUser) return;

            const idInput = document.getElementById('procedure-form-id');
            const clientSelect = document.getElementById('procedure-form-client');
            const typeSelect = document.getElementById('procedure-form-type');
            const dateInput = document.getElementById('procedure-form-date');
            const statusSelect = document.getElementById('procedure-form-status');

            const id = idInput.value;
            const clientId = parseInt(clientSelect.value, 10);
            const typeId = parseInt(typeSelect.value, 10);
            const date = dateInput.value;
            const status = statusSelect.value;

            if (!clientId || !typeId || !date) {
                window.app.showToast('⚠️ Por favor completa los campos obligatorios del trámite.', 'warning');
                return;
            }

            if (id) {
                // Editar trámite existente
                const prev = window.db.findById('procedures', id);
                if (!prev) return;
                
                window.db.update('procedures', id, { clientId, typeId, date, status });
                
                // Auditoría
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'EDICION_TRAMITE',
                    timestamp: new Date().toISOString(),
                    details: `Editó trámite ${prev.code}. Nuevo Estado: ${status}.`,
                    ip: '192.168.10.15'
                });

                window.app.showToast('✅ Trámite actualizado correctamente.', 'success');
            } else {
                // Crear trámite
                const code = this.generateCode();
                const newProc = window.db.insert('procedures', {
                    code,
                    clientId,
                    typeId,
                    date,
                    status,
                    userId: currentUser.id
                });

                // Auditoría
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'CREACION_TRAMITE',
                    timestamp: new Date().toISOString(),
                    details: `Creó nuevo trámite ${code} para el tipo de documento ID ${typeId}.`,
                    ip: '192.168.10.15'
                });

                window.app.showToast(`✅ Trámite ${code} creado. Ahora puede interactuar con el Asistente IA.`, 'success');

                // Preguntar si quiere ir directo al asistente para este trámite
                if (confirm(`El trámite ${code} se creó con éxito.\n¿Desea iniciar el Asistente Notarial IA ahora para recopilar los datos del documento?`)) {
                    this.clearForm();
                    window.app.navigateTo('view-assistant');
                    // Esperar render de asistente y cargar trámite
                    setTimeout(() => {
                        const selector = document.getElementById('assistant-procedure-selector');
                        if (selector) {
                            selector.value = newProc.id;
                            selector.dispatchEvent(new Event('change'));
                        }
                    }, 100);
                    return;
                }
            }

            this.clearForm();
            window.app.navigateTo('view-procedures');
        },

        // Cargar formulario para edición
        editProcedure: function(id) {
            const p = window.db.findById('procedures', id);
            if (!p) return;

            window.app.navigateTo('view-procedures-new');
            this.populateSelectors();

            document.getElementById('procedure-form-title').textContent = 'Editar Trámite Notarial';
            document.getElementById('procedure-form-id').value = p.id;
            document.getElementById('procedure-form-client').value = p.clientId;
            document.getElementById('procedure-form-type').value = p.typeId;
            document.getElementById('procedure-form-date').value = p.date;
            document.getElementById('procedure-form-status').value = p.status;
            
            // Habilitar selección de estado en edición
            const statusContainer = document.getElementById('procedure-status-container');
            if (statusContainer) statusContainer.classList.remove('hidden');
        },

        // Eliminar trámite
        deleteProcedure: function(id) {
            const p = window.db.findById('procedures', id);
            if (!p) return;

            if (!confirm(`¿Está seguro de eliminar de forma permanente el trámite ${p.code}?`)) return;

            const currentUser = window.auth.getCurrentUser();
            
            // Eliminar documentos asociados
            const docs = window.db.findMany('documents', { procedureId: id });
            docs.forEach(doc => window.db.delete('documents', doc.id));

            window.db.delete('procedures', id);

            if (currentUser) {
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'ELIMINACION_TRAMITE',
                    timestamp: new Date().toISOString(),
                    details: `Eliminó trámite ${p.code} y sus borradores asociados.`,
                    ip: '192.168.10.15'
                });
            }

            window.app.showToast(`🗑️ Trámite ${p.code} eliminado correctamente.`, 'info');
            this.renderList();
        },

        // Limpiar formulario de trámites
        clearForm: function() {
            document.getElementById('procedure-form-title').textContent = 'Registrar Nuevo Trámite';
            document.getElementById('procedure-form-id').value = '';
            document.getElementById('procedure-form-client').value = '';
            document.getElementById('procedure-form-type').value = '';
            document.getElementById('procedure-form-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('procedure-form-status').value = 'Pendiente';
            
            const statusContainer = document.getElementById('procedure-status-container');
            if (statusContainer) statusContainer.classList.add('hidden');
        }
    };

    window.procedures = proceduresModule;
})();
