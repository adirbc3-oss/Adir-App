/**
 * Validación y normalización de NIF / NIE / CIF españoles.
 * Se usa para garantizar que los identificadores fiscales guardados son
 * coherentes (mayúsculas, sin guiones/espacios) y con letra de control válida,
 * imprescindible para comparaciones fiables entre clientes/proyectos.
 */

// Normaliza: quita guiones/espacios y pasa a mayúsculas.
export const normalizarNif = (raw = '') =>
    String(raw).replace(/[\s-]/g, '').toUpperCase();

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

// DNI: 8 dígitos + letra de control
const validarDni = (nif) => {
    if (!/^\d{8}[A-Z]$/.test(nif)) return false;
    const num = parseInt(nif.slice(0, 8), 10);
    return LETRAS_DNI[num % 23] === nif[8];
};

// NIE: X/Y/Z + 7 dígitos + letra de control
const validarNie = (nif) => {
    if (!/^[XYZ]\d{7}[A-Z]$/.test(nif)) return false;
    const prefijo = { X: '0', Y: '1', Z: '2' }[nif[0]];
    const num = parseInt(prefijo + nif.slice(1, 8), 10);
    return LETRAS_DNI[num % 23] === nif[8];
};

// CIF: letra inicial + 7 dígitos + dígito/letra de control
const validarCif = (nif) => {
    if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) return false;
    const digitos = nif.slice(1, 8);
    let sumaPar = 0;
    let sumaImpar = 0;
    for (let i = 0; i < digitos.length; i++) {
        const n = parseInt(digitos[i], 10);
        if (i % 2 === 0) {
            // posiciones impares (1,3,5,7) → ×2 y suma de dígitos
            const doble = n * 2;
            sumaImpar += doble < 10 ? doble : doble - 9;
        } else {
            sumaPar += n;
        }
    }
    const total = sumaPar + sumaImpar;
    const unidad = (10 - (total % 10)) % 10;
    const control = nif[8];
    const letraControl = 'JABCDEFGHI'[unidad];
    // Según la letra inicial el control es número, letra, o cualquiera de los dos.
    if ('PQRSNW'.includes(nif[0])) return control === letraControl;       // solo letra
    if ('ABEH'.includes(nif[0]))   return control === String(unidad);     // solo número
    return control === String(unidad) || control === letraControl;        // ambos válidos
};

/** Devuelve true si el identificador es un DNI, NIE o CIF español válido. */
export const esNifValido = (raw) => {
    const nif = normalizarNif(raw);
    if (nif.length !== 9) return false;
    return validarDni(nif) || validarNie(nif) || validarCif(nif);
};
