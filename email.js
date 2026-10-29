/**
 * email.js - Envío de avisos de aprobación mediante EmailJS.
 * Configure los tres identificadores de EmailJS en este archivo antes de habilitar los envíos.
 */
(function () {
    const EMAILJS_PUBLIC_KEY = 'PEGA_AQUI_TU_PUBLIC_KEY';
    const EMAILJS_SERVICE_ID = 'PEGA_AQUI_TU_SERVICE_ID';
    const EMAILJS_TEMPLATE_ID = 'PEGA_AQUI_TU_TEMPLATE_ID';

    function sendApprovalEmail({ userName, userEmail, procedureReference }) {
        if (!window.emailjs) {
            return Promise.reject(new Error('No se cargó la biblioteca EmailJS. Verifique su conexión a Internet.'));
        }
        if ([EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID].some(value => value.startsWith('PEGA_AQUI_'))) {
            return Promise.reject(new Error('Configure la Public Key, Service ID y Template ID de EmailJS en email.js.'));
        }
        if (!userName || !userEmail || !procedureReference) {
            return Promise.reject(new Error('Faltan el nombre, correo o referencia del trámite para enviar el aviso.'));
        }

        return window.emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            {
                to_name: userName,
                to_email: userEmail,
                procedure_reference: procedureReference
            },
            { publicKey: EMAILJS_PUBLIC_KEY }
        );
    }

    window.emailNotifications = { sendApprovalEmail };
})();
