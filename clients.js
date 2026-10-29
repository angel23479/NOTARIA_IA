/**
 * clients.js - Módulo de Gestión de Clientes
 * Implementa el CRUD de clientes, búsquedas, historial de trámites y validación de cédula ecuatoriana.
 */

(function() {
    // Algoritmo de validación de Cédula Ecuatoriana (10 dígitos)
    function validarCedulaEcuatoriana(cedula) {
        cedula = cedula.trim();
        if (cedula.length !== 10) return false;
        if (!/^\d+$/.test(cedula)) return false;

        // Provincias de Ecuador (01 al 24, o 30 para residencias en el exterior)
        const provincia = parseInt(cedula.substring(0, 2), 10);
        if ((provincia < 1 || provincia > 24) && provincia !== 30) return false;

        // Tercer dígito menor a 6
        const tercerDigito = parseInt(cedula.substring(2, 3), 10);
        if (tercerDigito >= 6) return false;

        // Coeficientes para el algoritmo
        const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
        let suma = 0;

        for (let i = 0; i < 9; i++) {
            let valor = parseInt(cedula.charAt(i), 10) * coeficientes[i];
            if (valor >= 10) valor -= 9;
            suma += valor;
        }

        const verificador = parseInt(cedula.charAt(9), 10);
        const decenaSuperior = Math.ceil(suma / 10) * 10;
        let digitoCalculado = decenaSuperior - suma;
        if (digitoCalculado === 10) digitoCalculado = 0;

        return digitoCalculado === verificador;
    }

    const clientsModule = {
        // Validar cédula expuesta
        isValidCedula: validarCedulaEcuatoriana,

        // Renderizar el listado de clientes
        renderList: function(searchQuery = '') {
            const listContainer = document.getElementById('clients-table-body');
            if (!listContainer) return;

            const allClients = window.db.getCollection('clients');
            
            // Filtrar clientes
            const query = searchQuery.trim().toLowerCase();
            const filtered = allClients.filter(c => {
                if (!query) return true;
                return c.cedula.includes(query) || 
                       c.names.toLowerCase().includes(query) || 
                       c.surnames.toLowerCase().includes(query);
            });

            if (filtered.length === 0) {
                listContainer.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-8 text-secondary">
                            No se encontraron clientes que coincidan con la búsqueda.
                        </td>
                    </tr>`;
                return;
            }

            listContainer.innerHTML = filtered.map(c => `
                <tr>
                    <td><strong>${c.cedula}</strong></td>
                    <td>${c.names} ${c.surnames}</td>
                    <td>${c.phone || 'N/D'}</td>
                    <td>${c.email || 'N/D'}</td>
                    <td><span class="badge badge-info">${c.maritalStatus}</span></td>
                    <td class="table-actions">
                        <button class="btn btn-text btn-sm" onclick="clients.viewDetails(${c.id})" title="Ver Ficha y Historial">👁️ Ver</button>
                        <button class="btn btn-text btn-sm" onclick="clients.openEditForm(${c.id})" title="Editar Cliente">✏️ Editar</button>
                        <button class="btn btn-text btn-sm text-error" onclick="clients.deleteClient(${c.id})" title="Eliminar Cliente">🗑️</button>
                    </td>
                </tr>
            `).join('');
        },

        // Guardar Cliente (Crear / Editar)
        saveClient: function(event) {
            if (event) event.preventDefault();

            const currentUser = window.auth.getCurrentUser();
            if (!currentUser) return;

            const idInput = document.getElementById('client-form-id');
            const cedulaInput = document.getElementById('client-form-cedula');
            const namesInput = document.getElementById('client-form-names');
            const surnamesInput = document.getElementById('client-form-surnames');
            const dobInput = document.getElementById('client-form-dob');
            const maritalInput = document.getElementById('client-form-marital');
            const nationalityInput = document.getElementById('client-form-nationality');
            const addressInput = document.getElementById('client-form-address');
            const phoneInput = document.getElementById('client-form-phone');
            const emailInput = document.getElementById('client-form-email');
            const notesInput = document.getElementById('client-form-notes');

            const id = idInput.value;
            const cedula = cedulaInput.value.trim();
            const names = namesInput.value.trim();
            const surnames = surnamesInput.value.trim();
            const dob = dobInput.value;
            const maritalStatus = maritalInput.value;
            const nationality = nationalityInput.value.trim() || 'Ecuatoriana';
            const address = addressInput.value.trim();
            const phone = phoneInput.value.trim();
            const email = emailInput.value.trim();
            const notes = notesInput.value.trim();

            // Validaciones
            if (!cedula || !names || !surnames) {
                window.app.showToast('⚠️ Cédula, Nombres y Apellidos son obligatorios.', 'warning');
                return;
            }

            if (!validarCedulaEcuatoriana(cedula)) {
                window.app.showToast('❌ Cédula de identidad ecuatoriana inválida.', 'error');
                return;
            }

            // Validar cédula duplicada (si es nuevo o cambió en edición)
            const duplicate = window.db.findOne('clients', { cedula: cedula });
            if (duplicate && (!id || duplicate.id != id)) {
                window.app.showToast('❌ Ya existe un cliente con esta cédula de identidad.', 'error');
                return;
            }

            const clientData = {
                cedula, names, surnames, dob, maritalStatus, nationality, address, phone, email, notes
            };

            if (id) {
                // Editar cliente
                window.db.update('clients', id, clientData);
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'EDICION_CLIENTE',
                    timestamp: new Date().toISOString(),
                    details: `Editó datos del cliente ${names} ${surnames} (C.I. ${cedula})`,
                    ip: '192.168.10.15'
                });
                window.app.showToast('✅ Cliente actualizado correctamente.', 'success');
            } else {
                // Crear cliente
                const newClient = window.db.insert('clients', clientData);
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'CREACION_CLIENTE',
                    timestamp: new Date().toISOString(),
                    details: `Creó cliente nuevo ${names} ${surnames} (C.I. ${cedula})`,
                    ip: '192.168.10.15'
                });
                window.app.showToast('✅ Cliente creado correctamente.', 'success');
            }

            // Limpiar formulario y navegar al listado
            this.clearForm();
            window.app.navigateTo('view-clients');
        },

        // Cargar datos en formulario de edición
        openEditForm: function(id) {
            const client = window.db.findById('clients', id);
            if (!client) return;

            window.app.navigateTo('view-clients-new');
            
            // Cambiar título de sección
            document.getElementById('client-form-title').textContent = 'Editar Cliente Notarial';
            
            document.getElementById('client-form-id').value = client.id;
            document.getElementById('client-form-cedula').value = client.cedula;
            document.getElementById('client-form-names').value = client.names;
            document.getElementById('client-form-surnames').value = client.surnames;
            document.getElementById('client-form-dob').value = client.dob || '';
            document.getElementById('client-form-marital').value = client.maritalStatus || 'SOLTERO';
            document.getElementById('client-form-nationality').value = client.nationality || 'Ecuatoriana';
            document.getElementById('client-form-address').value = client.address || '';
            document.getElementById('client-form-phone').value = client.phone || '';
            document.getElementById('client-form-email').value = client.email || '';
            document.getElementById('client-form-notes').value = client.notes || '';
        },

        // Ver ficha de cliente con historial de trámites
        viewDetails: function(id) {
            const client = window.db.findById('clients', id);
            if (!client) return;

            window.app.navigateTo('view-clients-detail');

            // Llenar campos de la ficha
            document.getElementById('c-detail-fullname').textContent = `${client.names} ${client.surnames}`;
            document.getElementById('c-detail-cedula').textContent = client.cedula;
            document.getElementById('c-detail-dob').textContent = client.dob ? new Date(client.dob).toLocaleDateString('es-ES') : 'N/D';
            document.getElementById('c-detail-marital').textContent = client.maritalStatus;
            document.getElementById('c-detail-nationality').textContent = client.nationality || 'Ecuatoriana';
            document.getElementById('c-detail-phone').textContent = client.phone || 'N/D';
            document.getElementById('c-detail-email').textContent = client.email || 'N/D';
            document.getElementById('c-detail-address').textContent = client.address || 'N/D';
            document.getElementById('c-detail-notes').textContent = client.notes || 'Sin observaciones.';
            document.getElementById('c-detail-created').textContent = new Date(client.createdAt).toLocaleDateString('es-ES');

            // Botón editar rápido
            const editBtn = document.getElementById('c-detail-edit-btn');
            if (editBtn) {
                editBtn.onclick = () => this.openEditForm(client.id);
            }

            // Historial de Trámites
            const proceduresContainer = document.getElementById('c-detail-procedures-list');
            if (proceduresContainer) {
                const clientProcedures = window.db.findMany('procedures', { clientId: client.id });
                
                if (clientProcedures.length === 0) {
                    proceduresContainer.innerHTML = `<div class="empty-state small"><p>Este cliente no registra trámites en el sistema.</p></div>`;
                    return;
                }

                proceduresContainer.innerHTML = clientProcedures.map(p => {
                    const docType = window.db.findById('document_types', p.typeId);
                    const statusClass = window.app.getStatusClass(p.status);
                    return `
                        <div class="procedure-item" onclick="app.viewProcedureDetail(${p.id})">
                            <div class="procedure-item-header">
                                <span class="procedure-code">${p.code}</span>
                                <span class="badge ${statusClass}">${p.status}</span>
                            </div>
                            <div class="procedure-type">${docType ? docType.name : 'Tipo desconocido'}</div>
                            <div class="procedure-date">${new Date(p.date).toLocaleDateString('es-ES')}</div>
                        </div>`;
                }).join('');
            }
        },

        // Eliminar / Desactivar Cliente
        deleteClient: function(id) {
            const client = window.db.findById('clients', id);
            if (!client) return;

            // Verificar si tiene trámites asociados
            const procedures = window.db.findMany('procedures', { clientId: id });
            if (procedures.length > 0) {
                window.app.showToast('❌ No se puede eliminar el cliente porque tiene trámites activos registrados.', 'error');
                return;
            }

            if (!confirm(`¿Está seguro de eliminar de forma permanente al cliente ${client.names} ${client.surnames} (C.I. ${client.cedula})?`)) return;

            const currentUser = window.auth.getCurrentUser();
            window.db.delete('clients', id);
            
            // Log auditoría
            if (currentUser) {
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'ELIMINACION_CLIENTE',
                    timestamp: new Date().toISOString(),
                    details: `Eliminó el cliente ${client.names} ${client.surnames} (C.I. ${client.cedula})`,
                    ip: '192.168.10.15'
                });
            }

            window.app.showToast('🗑️ Cliente eliminado correctamente.', 'info');
            this.renderList();
        },

        // Limpiar formulario
        clearForm: function() {
            document.getElementById('client-form-title').textContent = 'Registrar Nuevo Cliente Notarial';
            document.getElementById('client-form-id').value = '';
            document.getElementById('client-form-cedula').value = '';
            document.getElementById('client-form-names').value = '';
            document.getElementById('client-form-surnames').value = '';
            document.getElementById('client-form-dob').value = '';
            document.getElementById('client-form-marital').value = 'SOLTERO';
            document.getElementById('client-form-nationality').value = 'Ecuatoriana';
            document.getElementById('client-form-address').value = '';
            document.getElementById('client-form-phone').value = '';
            document.getElementById('client-form-email').value = '';
            document.getElementById('client-form-notes').value = '';
        }
    };

    window.clients = clientsModule;
})();
