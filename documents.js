/**
 * documents.js - Módulo de Generación, Edición y Revisión de Documentos
 * Gestiona el reemplazo de variables, la edición de borradores (tipo hoja A4),
 * la descarga de archivos y la revisión del notario.
 */

(function() {
    const documentsModule = {
        // Reemplaza variables en una plantilla
        compileTemplate: function(templateContent, variables) {
            let compiled = templateContent;
            for (let key in variables) {
                const value = variables[key];
                // Regex global para reemplazar todas las apariciones de {{VARIABLE}}
                const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                compiled = compiled.replace(regex, value);
            }
            return compiled;
        },

        // Genera el borrador a partir de los datos conversacionales
        generateDraft: function(procedureId) {
            const currentUser = window.auth.getCurrentUser();
            if (!currentUser) return;

            const p = window.db.findById('procedures', procedureId);
            if (!p) return;

            const client = window.db.findById('clients', p.clientId);
            const template = window.db.findOne('templates', { typeId: p.typeId, active: true });
            const conv = window.db.findOne('ai_conversations', { procedureId: p.id });

            if (!template || !conv) {
                window.app.showToast('❌ Error al generar borrador: Datos incompletos.', 'error');
                return;
            }

            // Validar que no falten variables críticas obligatorias
            const missing = template.variables.filter(v => !conv.variablesCollected[v] || conv.variablesCollected[v] === 'N/D');
            if (missing.length > 0) {
                window.app.showToast(`❌ Falta completar variables obligatorias: ${missing.join(', ')}`, 'error');
                return;
            }

            // Compilar contenido del documento
            const compiledContent = this.compileTemplate(template.content, conv.variablesCollected);
            const title = `Borrador de ${template.name} - ${client.surnames} ${client.names}`;

            // Verificar si ya existe un documento asociado a este trámite
            let doc = window.db.findOne('documents', { procedureId: p.id });

            if (doc) {
                // Actualizar documento y registrar versión
                window.db.insert('document_versions', {
                    documentId: doc.id,
                    content: doc.content,
                    updatedBy: currentUser.fullname,
                    updatedAt: new Date().toISOString(),
                    reason: 'Actualización por nueva recopilación de datos IA.'
                });

                doc = window.db.update('documents', doc.id, {
                    title,
                    content: compiledContent,
                    status: 'borrador', // Vuelve a estado borrador
                    updatedAt: new Date().toISOString()
                });
            } else {
                // Crear documento nuevo
                doc = window.db.insert('documents', {
                    procedureId: p.id,
                    templateId: template.id,
                    title,
                    content: compiledContent,
                    status: 'borrador',
                    corrections: ''
                });
            }

            // Actualizar estado del trámite a "Borrador generado"
            window.db.update('procedures', p.id, { status: 'Borrador generado' });

            // Registrar en auditoría
            window.db.insert('audit_logs', {
                userId: currentUser.id,
                username: currentUser.username,
                role: currentUser.role,
                action: 'GENERACION_BORRADOR',
                timestamp: new Date().toISOString(),
                details: `Generó borrador de documento para trámite ${p.code} (${title})`,
                ip: '192.168.10.15'
            });

            // Enviar notificación a personal
            window.db.insert('notifications', {
                userId: p.userId, // Creador del trámite
                message: `Se ha generado el borrador para el trámite ${p.code}.`,
                read: false,
                createdAt: new Date().toISOString()
            });

            window.app.showToast('✅ Borrador oficial generado con éxito.', 'success');
            
            // Navegar a la pantalla de edición
            this.openEditor(doc.id);
        },

        // Abrir pantalla de edición de documentos
        openEditor: function(docId) {
            const doc = window.db.findById('documents', docId);
            if (!doc) return;

            const p = window.db.findById('procedures', doc.procedureId);
            const client = window.db.findById('clients', p.clientId);
            const currentUser = window.auth.getCurrentUser();

            window.app.navigateTo('view-document-editor');

            // Cargar datos en la UI del editor
            document.getElementById('editor-doc-title').textContent = doc.title;
            document.getElementById('editor-doc-procedure').textContent = p.code;
            document.getElementById('editor-doc-client').textContent = `${client.names} ${client.surnames} (${client.cedula})`;
            document.getElementById('editor-doc-status').textContent = doc.status.toUpperCase();
            
            const badgeClass = window.app.getStatusClass(doc.status === 'borrador' ? 'Borrador generado' : doc.status === 'revision' ? 'En revisión' : doc.status === 'aprobado' ? 'Aprobado' : 'Rechazado');
            const statusEl = document.getElementById('editor-doc-status');
            statusEl.className = `badge ${badgeClass}`;

            // Poner contenido en la hoja editable
            const pageEl = document.getElementById('editor-sheet-page');
            pageEl.innerHTML = doc.content.replace(/\n/g, '<br>');

            // Sello de agua condicional
            if (doc.status !== 'aprobado') {
                pageEl.classList.add('has-watermark');
            } else {
                pageEl.classList.remove('has-watermark');
            }

            // Mostrar observaciones del notario si existen
            const obsBox = document.getElementById('editor-observations-box');
            if (obsBox) {
                if (doc.status === 'rechazado' && doc.corrections) {
                    obsBox.classList.remove('hidden');
                    document.getElementById('editor-observations-text').textContent = doc.corrections;
                } else {
                    obsBox.classList.add('hidden');
                }
            }

            // Asignar funciones a los botones
            document.getElementById('editor-btn-save').onclick = () => this.saveEditorChanges(doc.id);
            document.getElementById('editor-btn-review').onclick = () => this.sendToReview(doc.id);
            document.getElementById('editor-btn-word').onclick = () => this.downloadWord(doc.id);
            document.getElementById('editor-btn-pdf').onclick = () => this.downloadPDF(doc.id);

            // Ajustar visibilidad de botones según rol y estado
            const canEdit = currentUser && (currentUser.role === 'ADMINISTRADOR' || currentUser.role === 'PERSONAL_NOTARIAL') && doc.status !== 'aprobado';
            pageEl.contentEditable = canEdit ? "true" : "false";
            
            const saveBtn = document.getElementById('editor-btn-save');
            const reviewBtn = document.getElementById('editor-btn-review');
            if (saveBtn) saveBtn.classList.toggle('hidden', !canEdit);
            if (reviewBtn) reviewBtn.classList.toggle('hidden', !canEdit || doc.status === 'revision');
        },

        // Guardar cambios manuales realizados en el editor A4
        saveEditorChanges: function(docId) {
            const doc = window.db.findById('documents', docId);
            if (!doc) return;

            const currentUser = window.auth.getCurrentUser();
            const pageEl = document.getElementById('editor-sheet-page');
            
            // Reemplazar saltos de línea html por texto normal
            const newContent = pageEl.innerHTML
                .replace(/<br>/g, '\n')
                .replace(/<div>/g, '\n')
                .replace(/<\/div>/g, '')
                .replace(/&nbsp;/g, ' ');

            // Insertar versión en el historial de modificaciones
            window.db.insert('document_versions', {
                documentId: doc.id,
                content: doc.content,
                updatedBy: currentUser.fullname,
                updatedAt: new Date().toISOString(),
                reason: 'Edición manual del usuario.'
            });

            // Actualizar documento
            window.db.update('documents', doc.id, {
                content: newContent,
                updatedAt: new Date().toISOString()
            });

            // Log auditoría
            window.db.insert('audit_logs', {
                userId: currentUser.id,
                username: currentUser.username,
                role: currentUser.role,
                action: 'EDICION_MANUAL_DOCUMENTO',
                timestamp: new Date().toISOString(),
                details: `Modificó manualmente el contenido del borrador "${doc.title}".`,
                ip: '192.168.10.15'
            });

            window.app.showToast('✅ Cambios del documento guardados localmente.', 'success');
        },

        // Enviar documento a revisión del Notario
        sendToReview: function(docId) {
            // Guardar primero por si acaso
            this.saveEditorChanges(docId);

            const doc = window.db.findById('documents', docId);
            if (!doc) return;

            const p = window.db.findById('procedures', doc.procedureId);
            const currentUser = window.auth.getCurrentUser();

            // Cambiar estados
            window.db.update('documents', doc.id, { status: 'revision' });
            window.db.update('procedures', p.id, { status: 'En revisión' });

            // Enviar notificación a los Notarios (Rol NOTARIO o ADMIN)
            const users = window.db.getCollection('users');
            users.forEach(u => {
                if (u.role === 'NOTARIO' || u.role === 'ADMINISTRADOR') {
                    window.db.insert('notifications', {
                        userId: u.id,
                        message: `Nuevo documento del trámite ${p.code} enviado a revisión por ${currentUser.fullname}.`,
                        read: false,
                        createdAt: new Date().toISOString()
                    });
                }
            });

            // Log auditoría
            window.db.insert('audit_logs', {
                userId: currentUser.id,
                username: currentUser.username,
                role: currentUser.role,
                action: 'ENVIO_A_REVISION',
                timestamp: new Date().toISOString(),
                details: `Envió documento del trámite ${p.code} a revisión notarial.`,
                ip: '192.168.10.15'
            });

            window.app.showToast('🔔 Borrador enviado a revisión notarial con éxito.', 'success');
            
            // Recargar vista de edición para ver estados actualizados
            this.openEditor(docId);
        },

        // Descarga de archivo de Word en formato nativo XML/Doc
        downloadWord: function(docId) {
            const doc = window.db.findById('documents', docId);
            if (!doc) return;

            const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]);
            const safeTitle = escapeHtml(doc.title);
            const formattedContent = String(doc.content).split('\n')
                .map(paragraph => `<p>${escapeHtml(paragraph) || '&nbsp;'}</p>`)
                .join('');
            const fullHtml = `
                <html xmlns:o="urn:schemas-microsoft-com:office:office"
                      xmlns:w="urn:schemas-microsoft-com:office:word"
                      xmlns:v="urn:schemas-microsoft-com:vml"
                      xmlns="http://www.w3.org/TR/REC-html10">
                <head>
                    <meta charset="utf-8">
                    <title>${safeTitle}</title>
                    <style>
                        @page Section1 {
                            size: 595.3pt 841.9pt;
                            margin: 72pt;
                            mso-header: wordHeader;
                            mso-header-margin: 35.4pt;
                            mso-footer-margin: 35.4pt;
                        }
                        div.Section1 { page: Section1; }
                        body { font-family: Arial; font-size: 12pt; line-height: 1.5; text-align: justify; }
                    </style>
                </head>
                <body>
                    <div style="mso-element:header" id="wordHeader">
                        <p class="MsoHeader">
                            <v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136"
                                adj="10800" path="m@7,l@8,m@5,21600l@6,21600e">
                                <v:formulas>
                                    <v:f eqn="sum #0 0 10800"/>
                                    <v:f eqn="prod #0 2 1"/>
                                    <v:f eqn="sum 21600 0 @1"/>
                                    <v:f eqn="sum 0 0 @2"/>
                                    <v:f eqn="sum 21600 0 @3"/>
                                    <v:f eqn="if @0 @3 0"/>
                                    <v:f eqn="if @0 21600 @1"/>
                                    <v:f eqn="if @0 0 @2"/>
                                    <v:f eqn="if @0 @4 21600"/>
                                    <v:f eqn="mid @5 @6"/>
                                    <v:f eqn="mid @8 @5"/>
                                    <v:f eqn="mid @7 @8"/>
                                    <v:f eqn="mid @6 @7"/>
                                    <v:f eqn="sum @6 0 @5"/>
                                </v:formulas>
                                <v:path textpathok="t" o:connecttype="none"/>
                                <v:textpath on="t" fitshape="t"/>
                            </v:shapetype>
                            <v:shape id="notariaWatermark" type="#_x0000_t136"
                                style="position:absolute;margin-left:0;margin-top:0;width:415pt;height:100pt;
                                       z-index:-251654144;rotation:315"
                                fillcolor="#d9d9d9" stroked="f">
                                <v:fill opacity=".35"/>
                                <v:textpath style="font-family:Arial;font-size:1pt"
                                    string="NOTARIA CHINCHIPE"/>
                            </v:shape>
                        </p>
                    </div>
                    <div class="Section1">${formattedContent}</div>
                </body>
                </html>`;

            const blob = new Blob(['\ufeff' + fullHtml], {
                type: 'application/msword;charset=utf-8'
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${doc.title.replace(/\s+/g, '_')}.doc`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            const currentUser = window.auth.getCurrentUser();
            if (currentUser) {
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'DESCARGA_WORD',
                    timestamp: new Date().toISOString(),
                    details: `Descargó documento Word de "${doc.title}"`,
                    ip: '192.168.10.15'
                });
            }
        },

        // Imprimir / Guardar como PDF
        downloadPDF: function(docId) {
            const doc = window.db.findById('documents', docId);
            if (!doc) return;

            const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]);
            const safeTitle = escapeHtml(doc.title);
            const content = String(doc.content).split('\n')
                .map(paragraph => `<p>${escapeHtml(paragraph) || '&nbsp;'}</p>`)
                .join('');
            const watermark = '<div class="watermark">NOTARIA CHINCHIPE</div>';
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                window.app.showToast('El navegador bloqueó la ventana de impresión. Permita las ventanas emergentes e intente de nuevo.', 'error');
                return;
            }

            const printHtml = `<!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="utf-8">
                    <title>${safeTitle}</title>
                    <style>
                        @page { size: A4; margin: 20mm 18mm; }
                        * { box-sizing: border-box; }
                        body {
                            position: relative;
                            margin: 0;
                            color: #111;
                            font: 11pt Arial, sans-serif;
                            line-height: 1.45;
                        }
                        .document { position: relative; z-index: 1; }
                        .letterhead {
                            margin-bottom: 20px;
                            padding-bottom: 10px;
                            border-bottom: 2px solid #b45309;
                            text-align: center;
                        }
                        h1 {
                            margin: 0;
                            color: #1e3a8a;
                            font-size: 17pt;
                            text-transform: uppercase;
                        }
                        .notary { margin: 5px 0 0; color: #b45309; }
                        .location { margin: 2px 0 0; color: #555; font-size: 9pt; }
                        .details {
                            display: flex;
                            justify-content: space-between;
                            gap: 16px;
                            margin-bottom: 18px;
                            padding-bottom: 6px;
                            border-bottom: 1px dashed #aaa;
                            color: #444;
                            font-size: 9pt;
                        }
                        .content { text-align: justify; }
                        .content p { margin: 0 0 5px; orphans: 3; widows: 3; }
                        .signatures {
                            display: flex;
                            justify-content: space-around;
                            gap: 40px;
                            margin: 56px 0 0;
                            text-align: center;
                            break-inside: avoid;
                        }
                        .signature { width: 40%; }
                        .signature-line { padding-top: 5px; border-top: 1px solid #111; }
                        .watermark {
                            position: fixed;
                            top: 42%;
                            left: 0;
                            width: 100%;
                            color: rgba(220, 38, 38, .12);
                            font-size: 25pt;
                            font-weight: bold;
                            text-align: center;
                            transform: rotate(-35deg);
                            pointer-events: none;
                        }
                        @media screen {
                            body { max-width: 210mm; min-height: 297mm; margin: 20px auto; padding: 20mm 18mm; }
                        }
                        @media print {
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    ${watermark}
                    <main class="document">
                        <header class="letterhead">
                            <h1>Notaría del Cantón Chinchipe</h1>
                            <p class="notary">Dr. Patricio Ordóñez - Notario Público</p>
                            <p class="location">Zumba, Zamora Chinchipe, Ecuador</p>
                        </header>
                        <div class="details">
                            <span><strong>Diligencia:</strong> ${safeTitle}</span>
                            <span><strong>Estado:</strong> ${escapeHtml(doc.status.toUpperCase())}</span>
                        </div>
                        <section class="content">${content}</section>
                        <footer class="signatures">
                            <div class="signature"><div class="signature-line">Compareciente</div></div>
                            <div class="signature">
                                <div class="signature-line">Dr. Patricio Ordóñez<br>Notario de Chinchipe</div>
                            </div>
                        </footer>
                    </main>
                </body>
                </html>`;

            let printStarted = false;
            const startPrint = () => {
                if (printStarted) return;
                printStarted = true;
                printWindow.focus();
                printWindow.print();
            };
            printWindow.onload = startPrint;
            printWindow.document.open();
            printWindow.document.write(printHtml);
            printWindow.document.close();
            setTimeout(startPrint, 250);

            const currentUser = window.auth.getCurrentUser();
            if (currentUser) {
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'DESCARGA_PDF',
                    timestamp: new Date().toISOString(),
                    details: `Preparó la descarga PDF de "${doc.title}"`,
                    ip: '192.168.10.15'
                });
            }
        },

        // --- REVISIÓN NOTARIAL (Cola de Trabajo del Notario) ---
        
        // Renderizar la bandeja de documentos en revisión
        renderRevisionList: function() {
            const listContainer = document.getElementById('notary-revision-body');
            if (!listContainer) return;

            const allDocs = window.db.getCollection('documents').filter(d => d.status === 'revision');
            const procedures = window.db.getCollection('procedures');
            const clients = window.db.getCollection('clients');

            if (allDocs.length === 0) {
                listContainer.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center py-8 text-secondary">
                            No hay documentos pendientes de revisión en este momento.
                        </td>
                    </tr>`;
                return;
            }

            listContainer.innerHTML = allDocs.map(d => {
                const p = procedures.find(proc => proc.id == d.procedureId);
                const client = clients.find(c => c.id == p?.clientId);
                const clientName = client ? `${client.surnames} ${client.names}` : 'N/D';
                
                return `
                    <tr>
                        <td><strong>${p ? p.code : 'N/D'}</strong></td>
                        <td>${d.title}</td>
                        <td>${clientName}</td>
                        <td>${new Date(d.createdAt).toLocaleDateString('es-ES')}</td>
                        <td class="table-actions">
                            <button class="btn btn-primary btn-sm" onclick="documents.openNotaryReviewModal(${d.id})">🔍 Revisar</button>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        // Abrir modal de revisión notarial
        openNotaryReviewModal: function(docId) {
            const doc = window.db.findById('documents', docId);
            if (!doc) return;

            const p = window.db.findById('procedures', doc.procedureId);
            const client = window.db.findById('clients', p.clientId);
            
            const modal = document.getElementById('notary-review-modal');
            if (!modal) return;

            modal.classList.remove('hidden');

            // Cargar datos en el modal
            document.getElementById('review-modal-title').textContent = `Revisión: ${doc.title}`;
            document.getElementById('review-modal-client-info').innerHTML = `
                <p><strong>Cédula:</strong> ${client.cedula}</p>
                <p><strong>Nombres:</strong> ${client.names} ${client.surnames}</p>
                <p><strong>Estado Civil:</strong> ${client.maritalStatus} | <strong>Dirección:</strong> ${client.address}</p>
            `;
            
            // Cargar historial de versiones
            const versions = window.db.findMany('document_versions', { documentId: doc.id });
            const historyContainer = document.getElementById('review-modal-history-list');
            if (versions.length === 0) {
                historyContainer.innerHTML = `<p class="text-muted text-xs">Sin modificaciones manuales registradas.</p>`;
            } else {
                historyContainer.innerHTML = versions.map(v => `
                    <div style="font-size: 0.75rem; border-bottom: 1px solid var(--border-color); padding: 4px 0;">
                        <strong>Por:</strong> ${v.updatedBy} · <strong>Fecha:</strong> ${new Date(v.updatedAt).toLocaleString('es-ES')}<br>
                        <span class="text-muted">${v.reason}</span>
                    </div>
                `).join('');
            }

            // Cargar texto completo del documento para previsualizar
            const previewSheet = document.getElementById('review-modal-sheet-preview');
            previewSheet.innerHTML = doc.content.replace(/\n/g, '<br>');

            // Limpiar área de comentarios del rechazo
            const commentArea = document.getElementById('review-modal-comment');
            if (commentArea) commentArea.value = '';

            // Asignar funciones a los botones del modal
            document.getElementById('review-modal-btn-approve').onclick = () => this.notaryDecision(doc.id, 'aprobar');
            document.getElementById('review-modal-btn-reject').onclick = () => this.notaryDecision(doc.id, 'rechazar');
            document.getElementById('review-modal-btn-close').onclick = () => modal.classList.add('hidden');
        },

        // Procesar decisión del notario (aprobar / rechazar)
        notaryDecision: function(docId, decision) {
            const doc = window.db.findById('documents', docId);
            if (!doc) return;

            const p = window.db.findById('procedures', doc.procedureId);
            const currentUser = window.auth.getCurrentUser();
            
            const modal = document.getElementById('notary-review-modal');

            if (decision === 'aprobar') {
                if (!confirm('¿Está seguro de APROBAR este borrador documental? Esta acción certificará el documento.')) return;
                
                // Actualizar estados
                window.db.update('documents', doc.id, { status: 'aprobado', corrections: '' });
                window.db.update('procedures', p.id, { status: 'Aprobado' });

                // Notificar al creador
                window.db.insert('notifications', {
                    userId: p.userId,
                    message: `Felicidades. El borrador del trámite ${p.code} ha sido APROBADO por el Notario.`,
                    read: false,
                    createdAt: new Date().toISOString()
                });

                // Log auditoría
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'APROBACION_DOCUMENTO',
                    timestamp: new Date().toISOString(),
                    details: `Aprobó oficialmente el borrador de documento No. ${doc.id} para trámite ${p.code}.`,
                    ip: '192.168.10.5'
                });

                window.app.showToast('✅ Documento aprobado oficialmente con éxito.', 'success');

                // Enviar al usuario que creó el trámite. EmailJS requiere un correo configurado en su ficha.
                const creator = window.db.findById('users', p.userId);
                window.emailNotifications.sendApprovalEmail({
                    userName: creator?.fullname,
                    userEmail: creator?.email,
                    procedureReference: p.code
                }).then(() => {
                    window.app.showToast('Correo de aprobación enviado al creador del trámite.', 'success');
                }).catch(error => {
                    console.error('No se pudo enviar el correo de aprobación:', error);
                    window.app.showToast(`El trámite fue aprobado, pero no se envió el correo: ${error.message}`, 'warning');
                });
            } else if (decision === 'rechazar') {
                const commentInput = document.getElementById('review-modal-comment');
                const comment = commentInput?.value?.trim();
                
                if (!comment) {
                    window.app.showToast('⚠️ Para rechazar un documento debe ingresar una observación/corrección obligatoria.', 'warning');
                    return;
                }

                if (!confirm('¿Desea rechazar este borrador y devolverlo al personal notarial para correcciones?')) return;

                // Actualizar estados
                window.db.update('documents', doc.id, { status: 'rechazado', corrections: comment });
                window.db.update('procedures', p.id, { status: 'Rechazado' });

                // Notificar al creador
                window.db.insert('notifications', {
                    userId: p.userId,
                    message: `El documento del trámite ${p.code} fue RECHAZADO por el Notario. Observación: "${comment}"`,
                    read: false,
                    createdAt: new Date().toISOString()
                });

                // Log auditoría
                window.db.insert('audit_logs', {
                    userId: currentUser.id,
                    username: currentUser.username,
                    role: currentUser.role,
                    action: 'RECHAZO_DOCUMENTO',
                    timestamp: new Date().toISOString(),
                    details: `Rechazó borrador del trámite ${p.code}. Observación: ${comment}`,
                    ip: '192.168.10.5'
                });

                window.app.showToast('⚠️ Documento rechazado y devuelto para corrección.', 'warning');
            }

            modal.classList.add('hidden');
            this.renderRevisionList();
            
            // Si el notario está en el dashboard principal, refrescar contadores
            if (document.getElementById('view-dashboard').classList.contains('active')) {
                window.app.renderDashboard();
            }
        }
    };

    window.documents = documentsModule;
})();
