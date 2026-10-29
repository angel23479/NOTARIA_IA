/**
 * audit.js - Módulo de Historial y Auditoría del Sistema
 * Gestiona la visualización del log inalterable de auditoría institucional.
 */

(function() {
    const auditModule = {
        // Renderizar el log de auditoría
        renderList: function() {
            const listContainer = document.getElementById('audit-table-body');
            if (!listContainer) return;

            const currentUser = window.auth.getCurrentUser();
            if (!currentUser || currentUser.role !== 'ADMINISTRADOR') {
                listContainer.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-8 text-error">
                            ⚠️ ACCESO DENEGADO. Solo los usuarios administradores pueden consultar el registro de auditoría.
                        </td>
                    </tr>`;
                return;
            }

            const allLogs = window.db.getCollection('audit_logs');
            
            if (allLogs.length === 0) {
                listContainer.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-8 text-secondary">
                            El registro de auditoría se encuentra vacío.
                        </td>
                    </tr>`;
                return;
            }

            // Ordenar por fecha descendente (los más recientes primero)
            const sorted = [...allLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            listContainer.innerHTML = sorted.map(log => {
                const actionBadgeClass = this.getActionBadgeClass(log.action);
                const roleBadgeClass = this.getRoleBadgeClass(log.role);
                const formattedTime = new Date(log.timestamp).toLocaleString('es-ES');
                
                return `
                    <tr>
                        <td><span class="text-xs font-mono text-secondary">${formattedTime}</span></td>
                        <td>
                            <strong>${log.username}</strong><br>
                            <span class="badge ${roleBadgeClass}" style="font-size:0.65rem; padding: 2px 4px;">${log.role}</span>
                        </td>
                        <td><span class="badge ${actionBadgeClass}">${log.action}</span></td>
                        <td style="max-width: 350px; font-size: 0.85rem;" class="text-secondary">${log.details}</td>
                        <td><span class="text-xs font-mono" style="color: var(--accent-secondary);">${log.ip || '127.0.0.1'}</span></td>
                    </tr>
                `;
            }).join('');
        },

        // Clase css para insignias de acciones
        getActionBadgeClass: function(action) {
            const maps = {
                'INICIO_SESION': 'badge-success',
                'CERRAR_SESION': 'badge-secondary',
                'CAMBIO_ROL_DEBUG': 'badge-warning',
                
                'CREACION_CLIENTE': 'badge-info',
                'EDICION_CLIENTE': 'badge-info',
                'ELIMINACION_CLIENTE': 'badge-danger',
                
                'CREACION_TRAMITE': 'badge-info',
                'EDICION_TRAMITE': 'badge-info',
                'ELIMINACION_TRAMITE': 'badge-danger',
                
                'CREACION_PLANTILLA': 'badge-success',
                'EDICION_PLANTILLA': 'badge-warning',
                'ESTADO_PLANTILLA': 'badge-secondary',
                
                'GENERACION_BORRADOR': 'badge-success',
                'EDICION_MANUAL_DOCUMENTO': 'badge-warning',
                'ENVIO_A_REVISION': 'badge-info',
                
                'APOBACION_DOCUMENTO': 'badge-success',
                'APROBACION_DOCUMENTO': 'badge-success',
                'RECHAZO_DOCUMENTO': 'badge-danger',
                
                'DESCARGA_WORD': 'badge-secondary',
                'IMPRESION_PDF': 'badge-secondary'
            };
            return maps[action] || 'badge-secondary';
        },

        // Clase css para roles
        getRoleBadgeClass: function(role) {
            const maps = {
                'ADMINISTRADOR': 'badge-danger',
                'PERSONAL_NOTARIAL': 'badge-info',
                'NOTARIO': 'badge-success',
                'USUARIO': 'badge-secondary'
            };
            return maps[role] || 'badge-secondary';
        }
    };

    window.audit = auditModule;
})();
