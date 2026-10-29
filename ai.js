/**
 * ai.js - Motor de Asistente Inteligente Conversacional
 * Controla la interfaz de chat, el flujo de recopilación de variables de plantillas,
 * la validación de cédulas, la llamada a Gemini API y el Modo Demo de simulación.
 */

(function() {
    const CHAT_STORAGE_PREFIX = 'notaria_chat_';
    const CLIENT_PROFILE_FIELDS = [
        { key: 'CLIENTE_NOMBRES', property: 'names', label: 'nombres', emptyQuestion: '¿Cuáles son sus nombres, sin incluir los apellidos?' },
        { key: 'CLIENTE_APELLIDOS', property: 'surnames', label: 'apellidos', emptyQuestion: '¿Cuáles son sus apellidos completos?' },
        { key: 'CLIENTE_CEDULA', property: 'cedula', label: 'cédula', emptyQuestion: '¿Cuál es su número de cédula?' },
        { key: 'CLIENTE_FECHA_NACIMIENTO', property: 'dob', label: 'fecha de nacimiento', emptyQuestion: '¿Cuál es su fecha de nacimiento?' },
        { key: 'CLIENTE_ESTADO_CIVIL', property: 'maritalStatus', label: 'estado civil', emptyQuestion: '¿Cuál es su estado civil (soltero/a, casado/a, divorciado/a, viudo/a o unión de hecho)?' },
        { key: 'CLIENTE_NACIONALIDAD', property: 'nationality', label: 'nacionalidad', emptyQuestion: '¿Cuál es su nacionalidad?' },
        { key: 'CLIENTE_DIRECCION', property: 'address', label: 'dirección domiciliaria', emptyQuestion: '¿Cuál es su dirección domiciliaria completa?' },
        { key: 'CLIENTE_TELEFONO', property: 'phone', label: 'teléfono de contacto', emptyQuestion: '¿Cuál es su teléfono de contacto?' },
        { key: 'CLIENTE_CORREO', property: 'email', label: 'correo electrónico', emptyQuestion: '¿Cuál es su correo electrónico? Si no tiene, indíquelo.' }
    ];

    function getMissingProfileFields(variables) {
        return CLIENT_PROFILE_FIELDS.filter(field => !variables[field.key] || variables[field.key] === 'N/D');
    }

    function getProfileQuestion(field, client) {
        const currentValue = client && client[field.property];
        if (!currentValue) return field.emptyQuestion;
        const subject = field.property === 'names' ? 'sus nombres' :
            field.property === 'surnames' ? 'sus apellidos' :
            field.property === 'dob' ? 'su fecha de nacimiento' :
            field.property === 'maritalStatus' ? 'su estado civil' :
            field.property === 'nationality' ? 'su nacionalidad' :
            field.property === 'address' ? 'su dirección domiciliaria' :
            field.property === 'phone' ? 'su teléfono' :
            field.property === 'email' ? 'su correo electrónico' : 'su cédula';
        return `Tengo registrado ${subject} como **${currentValue}**. ¿Confirma o desea corregirlo? Responda «confirmo» o escriba el dato correcto.`;
    }

    function getProfileValue(field, text, client) {
        const normalizedText = text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/^(si|confirmo|correcto|correcta|esta bien|de acuerdo|es correcto|es correcta)$/.test(normalizedText)) {
            return client[field.property]
                ? { value: client[field.property] }
                : { error: `Aún no tengo registrado su ${field.label}. Por favor, escriba ese dato.` };
        }

        const value = field.property === 'cedula' ? text.replace(/\D/g, '') : text.trim();
        if (field.property === 'cedula' && !window.clients.isValidCedula(value)) {
            return { error: 'La cédula ingresada no es válida. Verifique los 10 dígitos y vuelva a intentarlo.' };
        }
        if (field.property === 'email' && value.toLowerCase() !== 'no tengo' && value.toLowerCase() !== 'no tiene' &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return { error: 'El correo no tiene un formato válido. Ingréselo nuevamente o indique «no tengo».' };
        }
        if (field.property === 'maritalStatus') {
            const status = value.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
            const statuses = {
                SOLTERO: 'SOLTERO', SOLTERA: 'SOLTERO',
                CASADO: 'CASADO', CASADA: 'CASADO',
                DIVORCIADO: 'DIVORCIADO', DIVORCIADA: 'DIVORCIADO',
                VIUDO: 'VIUDO', VIUDA: 'VIUDO',
                UNION_DE_HECHO: 'UNION_DE_HECHO'
            };
            if (!statuses[status]) {
                return { error: 'Indique soltero/a, casado/a, divorciado/a, viudo/a o unión de hecho.' };
            }
            return { value: statuses[status] };
        }
        return { value };
    }

    // Obtener configuración de IA
    function getAIConfig() {
        return {
            mode: localStorage.getItem('notaria_ai_mode') || 'mock',
            key: localStorage.getItem('notaria_gemini_key') || ''
        };
    }

    // Guardar configuración de IA
    function saveAIConfig(mode, key) {
        localStorage.setItem('notaria_ai_mode', mode);
        localStorage.setItem('notaria_gemini_key', key);
    }

    // Envía mensaje a Gemini API
    async function callGeminiAPI(messages, variables, templateContent, variablesSchema, apiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        // Estructurar el prompt del sistema y la conversación
        const formattedSchema = JSON.stringify(variablesSchema);
        const templateVariables = Object.fromEntries(
            variablesSchema.filter(key => variables[key] !== undefined).map(key => [key, variables[key]])
        );
        const formattedCurrentVariables = JSON.stringify(templateVariables);
        
        const systemPrompt = `Eres el "Asistente Notarial IA", un asistente legal experto para la Notaría del Cantón Chinchipe (Ecuador). 
Tu trabajo es dialogar con el usuario para completar las variables necesarias para una plantilla de documento notarial.
La plantilla tiene las siguientes variables obligatorias: ${formattedSchema}.
Las variables recolectadas actualmente son: ${formattedCurrentVariables}.
El texto de la plantilla es: 
"""
${templateContent}
"""

Instrucciones críticas:
1. Analiza el último mensaje del usuario y extrae CUALQUIER variable del esquema.
2. Si el usuario proporciona datos, agrégalos. Valida la cédula si corresponde (las cédulas ecuatorianas tienen 10 dígitos y deben cumplir el dígito verificador).
3. Responde amigablemente. Si falta alguna variable, haz la pregunta para la SIGUIENTE variable que falte en la lista de forma clara y progresiva.
4. Si ya se recolectaron TODAS las variables necesarias, indícale al usuario que todos los datos están listos para generar el borrador.
5. Debes retornar tu respuesta ÚNICAMENTE como un objeto JSON válido con la siguiente estructura:
{
  "message": "<tu mensaje conversacional para el usuario>",
  "variables": { <todas las variables recolectadas hasta el momento, incluyendo las nuevas extraídas> },
  "finished": <true si ya se recolectaron todas las variables obligatorias, de lo contrario false>
}
No agregues explicaciones fuera del JSON, no uses bloques de código markdown de triple comilla (retorna solo el texto plano JSON).`;

        const contents = [];
        // Insertar el system prompt como el primer turno
        contents.push({
            role: 'user',
            parts: [{ text: systemPrompt }]
        });
        contents.push({
            role: 'model',
            parts: [{ text: "Entendido. Iniciaré la conversación solicitando los datos correspondientes según la plantilla seleccionada." }]
        });

        // Mapear historial de la conversación (últimos 10 mensajes para no saturar contexto)
        messages.filter(m => m.category !== 'client_profile').slice(-10).forEach(m => {
            contents.push({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            });
        });

        const body = {
            contents: contents,
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err?.error?.message || `Error HTTP ${response.status}`);
        }

        const resData = await response.json();
        const text = resData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        return JSON.parse(text);
    }

    // Simulación inteligente local (Modo Demo)
    function simulateLocalAI(userInput, currentVariables, variablesSchema, templateName) {
        const text = userInput.trim().toLowerCase();
        let nextVariables = { ...currentVariables };
        let message = "";

        // Encontrar la primera variable faltante antes de procesar
        let missing = variablesSchema.filter(v => !nextVariables[v] || nextVariables[v] === 'N/D');

        // Heurísticas básicas de extracción
        if (missing.length > 0) {
            const currentTarget = missing[0];

            if (currentTarget === 'COMPARECIENTE' || currentTarget === 'VENDEDOR' || currentTarget === 'COMPRADOR' || currentTarget === 'APODERADO' || currentTarget === 'ACOMPANANTE') {
                // Asumir que el usuario escribió el nombre
                if (userInput.length > 5 && !userInput.includes('quiero') && !userInput.includes('necesito')) {
                    nextVariables[currentTarget] = userInput;
                }
            } else if (currentTarget.includes('CEDULA')) {
                // Buscar número de 10 dígitos
                const match = userInput.match(/\b\d{10}\b/);
                if (match) {
                    const ced = match[0];
                    if (window.clients.isValidCedula(ced)) {
                        nextVariables[currentTarget] = ced;
                    } else {
                        message = `⚠️ El número de cédula ingresado (${ced}) no supera el algoritmo de validación de cédulas ecuatorianas. Por favor, verifícalo e ingrésalo de nuevo.`;
                    }
                }
            } else if (currentTarget === 'MARCA_VEHICULO') {
                if (userInput.length > 2) nextVariables[currentTarget] = userInput;
            } else if (currentTarget === 'PLACA') {
                // Placas ecuatorianas: 3 letras y 3 o 4 dígitos (ej: AAA-1234)
                const match = userInput.toUpperCase().match(/\b[A-Z]{3}-\d{3,4}\b|\b[A-Z]{3}\d{3,4}\b/);
                if (match) {
                    nextVariables[currentTarget] = match[0];
                } else if (userInput.length > 4) {
                    nextVariables[currentTarget] = userInput.toUpperCase();
                }
            } else if (currentTarget === 'PRECIO') {
                const match = userInput.match(/\b\d+[\d,.]*\b/);
                if (match) nextVariables[currentTarget] = match[0];
            } else if (currentTarget.includes('FECHA')) {
                // Extraer fecha si la escribió
                if (userInput.length > 4) nextVariables[currentTarget] = userInput;
            } else {
                if (userInput.length > 2) nextVariables[currentTarget] = userInput;
            }
        }

        // Recalcular variables faltantes tras extracción
        missing = variablesSchema.filter(v => !nextVariables[v] || nextVariables[v] === 'N/D');

        if (message === "") {
            if (missing.length === 0) {
                message = `¡Excelente! He recopilado todos los datos obligatorios para la plantilla **${templateName}**.
                
                Por favor, revisa el cuadro de variables a la derecha y haz clic en el botón **"GENERAR BORRADOR"** para crear el documento de borrador oficial del trámite.`;
            } else {
                const nextTarget = missing[0];
                const prompts = {
                    'COMPARECIENTE': 'Por favor, proporcione el nombre del compareciente (solicitante).',
                    'VENDEDOR': 'Por favor, ingrese el nombre completo del Vendedor del vehículo.',
                    'COMPRADOR': 'Por favor, ingrese el nombre completo del Comprador del vehículo.',
                    'APODERADO': 'Por favor, indique el nombre de la persona que recibirá el poder (Apoderado).',
                    'ACOMPANANTE': 'Por favor, indique el nombre del acompañante del menor en el viaje.',
                    'CEDULA_COMPARECIENTE': 'Por favor, proporcione el número de cédula (10 dígitos) del compareciente.',
                    'CEDULA_VENDEDOR': 'Por favor, proporcione la cédula de ciudadanía (10 dígitos) del Vendedor.',
                    'CEDULA_COMPRADOR': 'Por favor, proporcione la cédula de ciudadanía (10 dígitos) del Comprador.',
                    'CEDULA_APODERADO': 'Por favor, proporcione el número de cédula (10 dígitos) del Apoderado.',
                    'NOMBRE_MENOR': 'Por favor, ingrese el nombre completo del menor de edad.',
                    'DESTINO': '¿Cuál es el destino del viaje del menor?',
                    'FECHA_VIAJE': '¿Cuál es la fecha estimada del viaje? (ejemplo: 20 de Agosto del 2026)',
                    'MARCA_VEHICULO': 'Por favor, proporcione la marca y modelo del vehículo (ejemplo: Chevrolet Vitara).',
                    'PLACA': 'Ingrese el número de placa del vehículo (ejemplo: ZBA-1234).',
                    'PRECIO': '¿Cuál es el precio pactado para la venta del vehículo?',
                    'DECLARACION': 'Por favor, describa detalladamente los hechos que declarará el compareciente bajo juramento.',
                    'OBJETO_PODER': 'Por favor, describa el objeto específico o gestiones para las que se otorga el poder.',
                    'DOCUMENTO_PRIVADO': '¿Cuál es el nombre del documento privado que desea reconocer su firma? (ej: Contrato de Arrendamiento).',
                    'ESTADO_CIVIL': 'Indique el estado civil del compareciente (Soltero, Casado, Divorciado, Viudo, Unión de Hecho).',
                    'CIUDAD': '¿En qué ciudad se realiza la diligencia? (Por defecto: Zumba).',
                    'FECHA': '¿Qué fecha del trámite colocamos? (Por defecto: Hoy).'
                };

                message = prompts[nextTarget] || `Por favor, proporcione el dato para la variable: **${nextTarget}**.`;
            }
        }

        return {
            message,
            variables: nextVariables,
            finished: missing.length === 0
        };
    }

    const aiModule = {
        getAIConfig,
        saveAIConfig,
        getClientProfileFields: () => CLIENT_PROFILE_FIELDS,

        // Inicializar chat para un trámite específico
        initConversation: function(procedureId) {
            const p = window.db.findById('procedures', procedureId);
            if (!p) return null;

            const client = window.db.findById('clients', p.clientId);
            const template = window.db.findOne('templates', { typeId: p.typeId, active: true });
            
            if (!template) {
                window.app.showToast('❌ No hay una plantilla activa configurada para este tipo de trámite.', 'error');
                return null;
            }

            // Crear registro de conversación si no existe
            let conv = window.db.findOne('ai_conversations', { procedureId: p.id });
            if (!conv) {
                // Precargar variables conocidas por defecto a partir del cliente
                const variablesCollected = {};
                template.variables.forEach(v => {
                    variablesCollected[v] = 'N/D';
                });
                CLIENT_PROFILE_FIELDS.forEach(field => {
                    variablesCollected[field.key] = 'N/D';
                });

                // Auto-rellenar variables básicas si coinciden
                if (client) {
                    if (template.variables.includes('COMPARECIENTE')) {
                        variablesCollected['COMPARECIENTE'] = `${client.names} ${client.surnames}`;
                    }
                    if (template.variables.includes('VENDEDOR') && p.typeId === 4) { // Compraventa
                        variablesCollected['VENDEDOR'] = `${client.names} ${client.surnames}`;
                    }
                    if (template.variables.includes('CEDULA_COMPARECIENTE')) {
                        variablesCollected['CEDULA_COMPARECIENTE'] = client.cedula;
                    }
                    if (template.variables.includes('CEDULA_VENDEDOR') && p.typeId === 4) {
                        variablesCollected['CEDULA_VENDEDOR'] = client.cedula;
                    }
                    if (template.variables.includes('ESTADO_CIVIL')) {
                        variablesCollected['ESTADO_CIVIL'] = client.maritalStatus;
                    }
                    if (template.variables.includes('CIUDAD')) {
                        variablesCollected['CIUDAD'] = 'Zumba';
                    }
                    if (template.variables.includes('FECHA')) {
                        variablesCollected['FECHA'] = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
                    }
                }

                conv = window.db.insert('ai_conversations', {
                    procedureId: p.id,
                    status: 'conversando',
                    currentStep: 0,
                    variablesCollected: variablesCollected
                });

                // Mensaje de bienvenida inicial
                const clientName = client ? `${client.names} ${client.surnames}` : 'Compareciente';
                const welcomeMsg = `Hola, soy tu **Asistente Notarial IA**.

Antes de preparar el borrador de **${template.name}** para **${clientName}**, confirmaré los datos de identificación y contacto del cliente. Después completaré la información específica del trámite.`;
                
                window.db.insert('ai_messages', {
                    conversationId: conv.id,
                    role: 'assistant',
                    content: welcomeMsg,
                    timestamp: new Date().toISOString(),
                    category: 'client_profile'
                });

                const firstProfileField = getMissingProfileFields(variablesCollected)[0];
                window.db.insert('ai_messages', {
                    conversationId: conv.id,
                    role: 'assistant',
                    content: getProfileQuestion(firstProfileField, client),
                    timestamp: new Date().toISOString(),
                    category: 'client_profile'
                });
            } else {
                const variablesCollected = { ...conv.variablesCollected };
                let needsUpdate = false;
                CLIENT_PROFILE_FIELDS.forEach(field => {
                    if (variablesCollected[field.key] === undefined) {
                        variablesCollected[field.key] = 'N/D';
                        needsUpdate = true;
                    }
                });
                if (needsUpdate) {
                    conv = window.db.update('ai_conversations', conv.id, {
                        variablesCollected,
                        status: 'conversando'
                    });
                    if (!window.db.findMany('ai_messages', { conversationId: conv.id }).some(m => m.category === 'client_profile')) {
                        const firstProfileField = getMissingProfileFields(variablesCollected)[0];
                        window.db.insert('ai_messages', {
                            conversationId: conv.id,
                            role: 'assistant',
                            content: `Antes de continuar, confirmaré los datos del cliente. ${getProfileQuestion(firstProfileField, client)}`,
                            timestamp: new Date().toISOString(),
                            category: 'client_profile'
                        });
                    }
                }
            }

            return conv;
        },

        // Enviar mensaje al asistente de IA
        sendMessage: async function(conversationId, userText) {
            const conv = window.db.findById('ai_conversations', conversationId);
            if (!conv) return null;

            const p = window.db.findById('procedures', conv.procedureId);
            const template = window.db.findOne('templates', { typeId: p.typeId, active: true });
            const client = window.db.findById('clients', p.clientId);
            const missingProfileField = getMissingProfileFields(conv.variablesCollected)[0];
            if (missingProfileField && !client) {
                throw new Error('No se encontró la ficha del cliente asociada a este trámite.');
            }

            // Insertar mensaje del usuario
            window.db.insert('ai_messages', {
                conversationId: conv.id,
                role: 'user',
                content: userText,
                timestamp: new Date().toISOString(),
                category: missingProfileField ? 'client_profile' : 'template'
            });

            const messages = window.db.findMany('ai_messages', { conversationId: conv.id });
            if (missingProfileField) {
                const result = getProfileValue(missingProfileField, userText, client || {});
                const variables = { ...conv.variablesCollected };
                let responseMessage;

                if (result.error) {
                    responseMessage = `${result.error} ${getProfileQuestion(missingProfileField, client)}`;
                } else {
                    variables[missingProfileField.key] = result.value;
                    const clientUpdates = { [missingProfileField.property]: result.value };
                    if (missingProfileField.property === 'names') {
                        const fullName = `${result.value} ${client.surnames}`;
                        if (variables.COMPARECIENTE !== undefined) variables.COMPARECIENTE = fullName;
                        if (variables.VENDEDOR !== undefined) variables.VENDEDOR = fullName;
                    } else if (missingProfileField.property === 'surnames') {
                        const fullName = `${client.names} ${result.value}`;
                        if (variables.COMPARECIENTE !== undefined) variables.COMPARECIENTE = fullName;
                        if (variables.VENDEDOR !== undefined) variables.VENDEDOR = fullName;
                    } else if (missingProfileField.property === 'cedula') {
                        if (variables.CEDULA_COMPARECIENTE !== undefined) variables.CEDULA_COMPARECIENTE = result.value;
                        if (variables.CEDULA_VENDEDOR !== undefined) variables.CEDULA_VENDEDOR = result.value;
                    } else if (missingProfileField.property === 'maritalStatus' && variables.ESTADO_CIVIL !== undefined) {
                        variables.ESTADO_CIVIL = result.value;
                    }
                    window.db.update('clients', client.id, clientUpdates);

                    const nextProfileField = getMissingProfileFields(variables)[0];
                    responseMessage = nextProfileField
                        ? getProfileQuestion(nextProfileField, { ...client, ...clientUpdates })
                        : simulateLocalAI('', variables, template.variables, template.name).message;
                }

                const profileFinished = getMissingProfileFields(variables).length === 0;
                const templateFinished = template.variables.every(v => variables[v] && variables[v] !== 'N/D');
                window.db.update('ai_conversations', conv.id, {
                    variablesCollected: variables,
                    status: profileFinished && templateFinished ? 'completado' : 'conversando'
                });
                const aiMessage = window.db.insert('ai_messages', {
                    conversationId: conv.id,
                    role: 'assistant',
                    content: responseMessage,
                    timestamp: new Date().toISOString(),
                    category: profileFinished ? 'template' : 'client_profile'
                });
                return { aiMessage, variables, finished: profileFinished && templateFinished };
            }

            const { mode, key } = getAIConfig();
            let aiResult;

            if (mode === 'gemini' && key) {
                try {
                    aiResult = await callGeminiAPI(
                        messages, 
                        conv.variablesCollected, 
                        template.content, 
                        template.variables, 
                        key
                    );
                } catch (e) {
                    console.error("Error llamando a Gemini, usando simulación local:", e);
                    // Fallback a simulación si la API falla
                    aiResult = simulateLocalAI(userText, conv.variablesCollected, template.variables, template.name);
                    aiResult.message = `*(Nota: Falló la API de Gemini - Usando asistente local)*\n\n${aiResult.message}`;
                }
            } else {
                // Modo Mock
                await new Promise(r => setTimeout(r, 800)); // Delay para naturalidad
                aiResult = simulateLocalAI(userText, conv.variablesCollected, template.variables, template.name);
            }

            aiResult.variables = { ...conv.variablesCollected, ...aiResult.variables };
            // Actualizar variables y estado de la conversación en la DB
            const profileFinished = getMissingProfileFields(conv.variablesCollected).length === 0;
            const finished = profileFinished && aiResult.finished;
            window.db.update('ai_conversations', conv.id, {
                variablesCollected: aiResult.variables,
                status: finished ? 'completado' : 'conversando'
            });

            // Insertar respuesta del asistente en la DB
            const aiMessage = window.db.insert('ai_messages', {
                conversationId: conv.id,
                role: 'assistant',
                content: aiResult.message,
                timestamp: new Date().toISOString(),
                category: 'template'
            });

            return {
                aiMessage,
                variables: aiResult.variables,
                finished
            };
        }
    };

    window.aiService = aiModule;
})();
