<?php
/**
 * Script para vaciar la caché de PHP (OPcache) en Dinahosting.
 * Sube este archivo a la carpeta /public_html/api/clear.php y ábrelo en tu navegador:
 * https://adirgestion.app/api/clear.php
 */
if (function_exists('opcache_reset')) {
    if (opcache_reset()) {
        echo "¡La caché OPcache de PHP se ha vaciado con éxito! Los cambios en api.php ya están activos.";
    } else {
        echo "No se pudo vaciar la caché OPcache.";
    }
} else {
    echo "OPcache no está activo en este servidor PHP.";
}
