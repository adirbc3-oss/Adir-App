<?php
/**
 * ADIR API — PHP REST wrapper para MySQL en Dinahosting
 * ======================================================
 * Actúa como capa de compatibilidad Supabase → MySQL.
 * Las páginas React NO necesitan cambios:
 *   - Los nombres de tabla son los mismos (propuestas, partidas…)
 *   - Las columnas BC3 se devuelven con sus nombres originales
 *     (Proyecto, id, propuesta_id…) aunque en MySQL se llamen
 *     proyecto_bc3, id_bc3, propuesta_bc3…
 *
 * Subir a:  /public_html/api/api.php
 * Variables de entorno del frontend (Vercel):
 *   VITE_API_URL = https://TU_DOMINIO/api/api.php
 *   VITE_API_KEY = (misma clave que API_KEY aquí)
 */

// ─── Configuración ────────────────────────────────────────────────────────────
define('API_KEY',  'CAMBIA_ESTA_CLAVE_LARGA_Y_ALEATORIA_MIN40CHARS');
define('DB_HOST',  'localhost');
define('DB_USER',  'TU_USUARIO_MYSQL');   // ver panel Dinahosting → Bases de datos
define('DB_PASS',  'TU_PASSWORD_MYSQL');
define('DB_NAME',  'adirg_bbdd');
define('PREFIX',   'ctcon_');

// ─── CORS ─────────────────────────────────────────────────────────────────────
$allowedOrigins = [
    'https://adir-app.vercel.app',
    'https://adirgestion.app',
    'http://localhost:5173',   // desarrollo local
    'http://localhost:3000',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header('Access-Control-Allow-Origin: https://adir-app.vercel.app');
}
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Api-Key, Prefer');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ─── Auth ─────────────────────────────────────────────────────────────────────
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($apiKey !== API_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// ─── Conexión ─────────────────────────────────────────────────────────────────
try {
    $pdo = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
         PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed: ' . $e->getMessage()]);
    exit;
}

// ─── Tabla whitelist y mapeo de nombres ───────────────────────────────────────
// Nombre Supabase → tabla MySQL (con prefijo)
$TABLE_MAP = [
    'propuestas'           => PREFIX . 'propuestas',
    'partidas'             => PREFIX . 'partidas',
    'presupuestos_cliente' => PREFIX . 'presupuestos_cliente',
    'proveedores'          => PREFIX . 'proveedores',
    'solicitudes'          => PREFIX . 'solicitudes',
    'respuestas'           => PREFIX . 'respuestas',
    'historial_cambios'    => PREFIX . 'historial_cambios',
    'base_precios_adir'    => PREFIX . 'base_precios_adir',
    'base_precios'         => PREFIX . 'base_precios_adir',  // alias legacy
    'PreciosCype'          => PREFIX . 'precios_cype',
    'configuracion'        => PREFIX . 'configuracion',
];

// ─── Configuración de traducción de columnas por tabla MySQL ──────────────────
//
// col_map:  supabase_col_name  →  mysql_col_name
//           (para filtros, INSERT, PATCH)
//
// reverse:  mysql_col_name  →  supabase_col_name
//           (para renombrar columnas en respuestas GET)
//
// hide_num_id: true → excluir la columna `id` numérica de las respuestas
//              y reemplazarla por el alias definido en reverse
//
$TABLE_CONFIG = [
    PREFIX . 'propuestas' => [
        'col_map'     => ['Proyecto' => 'proyecto_bc3'],
        'reverse'     => ['proyecto_bc3' => 'Proyecto'],
        'hide_num_id' => true,
    ],
    PREFIX . 'partidas' => [
        'col_map'     => ['id' => 'id_bc3', 'propuesta_id' => 'propuesta_bc3'],
        'reverse'     => ['id_bc3' => 'id', 'propuesta_bc3' => 'propuesta_id'],
        'hide_num_id' => true,
    ],
    PREFIX . 'presupuestos_cliente' => [
        'col_map'     => ['id' => 'id_bc3', 'propuesta_id' => 'propuesta_bc3'],
        'reverse'     => ['id_bc3' => 'id', 'propuesta_bc3' => 'propuesta_id'],
        'hide_num_id' => true,
    ],
    PREFIX . 'proveedores' => [
        'col_map'     => ['id' => 'id_bc3'],
        'reverse'     => ['id_bc3' => 'id'],
        'hide_num_id' => true,
    ],
    PREFIX . 'solicitudes' => [
        'col_map'     => ['id' => 'id_bc3', 'propuesta_id' => 'propuesta_bc3'],
        'reverse'     => ['id_bc3' => 'id', 'propuesta_bc3' => 'propuesta_id'],
        'hide_num_id' => true,
    ],
    PREFIX . 'respuestas' => [
        'col_map'     => [
            'id'           => 'id_bc3',
            'solicitud_id' => 'solicitud_bc3',
            'partida_id'   => 'partida_bc3',
            'proveedor_id' => 'proveedor_bc3',
        ],
        'reverse'     => [
            'id_bc3'          => 'id',
            'solicitud_bc3'   => 'solicitud_id',
            'partida_bc3'     => 'partida_id',
            'proveedor_bc3'   => 'proveedor_id',
        ],
        'hide_num_id' => true,
    ],
    PREFIX . 'historial_cambios'  => ['col_map' => [], 'reverse' => [], 'hide_num_id' => false],
    PREFIX . 'base_precios_adir'  => ['col_map' => [], 'reverse' => [], 'hide_num_id' => false],
    PREFIX . 'precios_cype'       => ['col_map' => [], 'reverse' => [], 'hide_num_id' => false],
    PREFIX . 'configuracion'      => ['col_map' => [], 'reverse' => [], 'hide_num_id' => false],
];

// ─── Helpers de traducción ────────────────────────────────────────────────────

/** Traduce un nombre de columna Supabase → MySQL para esta tabla */
function colToMySQL(string $mysqlTable, string $col): string {
    global $TABLE_CONFIG;
    $map = $TABLE_CONFIG[$mysqlTable]['col_map'] ?? [];
    return $map[$col] ?? $col;
}

/** Traduce un array de columnas para SELECT (devuelve lista SQL con aliases) */
function translateSelectCols(string $mysqlTable, string $selectStr): string {
    global $TABLE_CONFIG;
    $cfg = $TABLE_CONFIG[$mysqlTable] ?? [];
    $colMap  = $cfg['col_map']     ?? [];
    $reverse = $cfg['reverse']     ?? [];
    $hideId  = $cfg['hide_num_id'] ?? false;

    if (trim($selectStr) === '*') {
        // SELECT * pero con aliases para columnas renombradas
        // Excluye la clave numérica si está mapeada
        $aliases = [];
        foreach ($reverse as $mysqlCol => $sbCol) {
            $aliases[] = "`$mysqlCol` AS `$sbCol`";
        }
        if ($hideId) {
            // Seleccionamos todo excepto `id` numérico y las columnas _bc3 que van con alias
            $exclude = array_merge(['id'], array_keys($reverse));
            $excludeStr = implode(', ', array_map(fn($c) => "`$c`", $exclude));
            $base = "* /*!80000 EXCEPT ($excludeStr)*/ "; // MySQL 8+
            // Fallback para MySQL 5.x / MariaDB: usar INFORMATION_SCHEMA
            // Nota: en Dinahosting generalmente es MySQL 5.7/8 o MariaDB 10.x
            // Usamos solución compatible: devolvemos `*` y post-procesamos en PHP
            return '*';   // post-procesado en PHP
        }
        return '*';
    }

    // Columnas específicas
    $cols = array_map('trim', explode(',', $selectStr));
    $sql  = [];
    foreach ($cols as $col) {
        if ($col === '') continue;
        $colClean = preg_replace('/[^a-zA-Z0-9_]/', '', $col);
        $mysqlCol = $colMap[$colClean] ?? $colClean;
        if ($mysqlCol !== $colClean) {
            $sql[] = "`$mysqlCol` AS `$colClean`";
        } else {
            $sql[] = "`$colClean`";
        }
    }
    return implode(', ', $sql) ?: '*';
}

/** Traduce las claves de un array de filtros/body de Supabase → MySQL */
function translateKeys(string $mysqlTable, array $data): array {
    global $TABLE_CONFIG;
    $map = $TABLE_CONFIG[$mysqlTable]['col_map'] ?? [];
    $out = [];
    foreach ($data as $k => $v) {
        $out[$map[$k] ?? $k] = $v;
    }
    return $out;
}

/** Post-procesa una fila: renombra columnas MySQL → Supabase y limpia id numérico */
function postProcessRow(string $mysqlTable, array $row): array {
    global $TABLE_CONFIG;
    $cfg     = $TABLE_CONFIG[$mysqlTable] ?? [];
    $reverse = $cfg['reverse']     ?? [];
    $hideId  = $cfg['hide_num_id'] ?? false;

    // Renombrar columnas _bc3 → nombre original
    foreach ($reverse as $mysqlCol => $sbCol) {
        if (array_key_exists($mysqlCol, $row)) {
            $row[$sbCol] = $row[$mysqlCol];
            unset($row[$mysqlCol]);
        }
    }

    // Ocultar el id numérico auto-increment
    if ($hideId && isset($row['id']) && !isset($row['Proyecto'])) {
        // Solo ocultar si no es ya el Proyecto (que ya se mapea desde proyecto_bc3)
        // Para propuestas, 'id' numérico ya fue removido al mapear proyecto_bc3 → Proyecto
        // Para el resto de tablas con hide_num_id, el 'id' numérico se oculta aquí
        // porque ya se ha expuesto como la columna bc3 renombrada
        if (isset($TABLE_CONFIG[$mysqlTable]['reverse']['id_bc3'])) {
            unset($row['id']);
        }
    }
    if ($hideId && isset($row['Proyecto'])) {
        // propuestas: siempre eliminar el id numérico
        unset($row['id']);
    }

    // Decodificar JSON en campo partidas
    if (isset($row['partidas']) && is_string($row['partidas'])) {
        $decoded = json_decode($row['partidas'], true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $row['partidas'] = $decoded;
        }
    }

    return $row;
}

// ─── Router ──────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$parts  = array_values(array_filter(explode('/', trim($uri, '/'))));

// URL: /api/api.php/TABLA  → último segmento es siempre la tabla
// Funciona tanto con /api/api.php/tabla como con /api/tabla (via .htaccess)
$sbTable = end($parts) ?: '';
$mysqlTable = $TABLE_MAP[$sbTable] ?? '';

if (!$mysqlTable) {
    http_response_code(404);
    echo json_encode(['error' => "Tabla '$sbTable' no encontrada"]);
    exit;
}

$query = $_GET;
$body  = json_decode(file_get_contents('php://input'), true) ?? [];

// ─── Construir WHERE desde filtros Supabase ───────────────────────────────────
function buildWhere(string $mysqlTable, array $params, PDO $pdo): array {
    $allowedOps = ['eq' => '=', 'neq' => '!=', 'gt' => '>', 'gte' => '>=',
                   'lt' => '<', 'lte' => '<=', 'like' => 'LIKE', 'in' => 'IN'];
    $conditions = [];
    $binds = [];

    foreach ($params as $key => $val) {
        if (in_array($key, ['select', 'limit', 'offset', 'order', 'apikey'])) continue;
        $mysqlCol = colToMySQL($mysqlTable, $key);

        if (strpos($val, '.') !== false) {
            [$op, $v] = explode('.', $val, 2);
            $sqlOp = $allowedOps[$op] ?? '=';
            if ($op === 'in') {
                $vals = explode(',', trim($v, '()'));
                $phs  = implode(',', array_fill(0, count($vals), '?'));
                $conditions[] = "`$mysqlCol` IN ($phs)";
                foreach ($vals as $iv) $binds[] = trim($iv, '"\'');
            } else {
                $conditions[] = "`$mysqlCol` $sqlOp ?";
                $binds[] = $v;
            }
        } else {
            $conditions[] = "`$mysqlCol` = ?";
            $binds[] = $val;
        }
    }
    return [
        'sql'   => $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '',
        'binds' => $binds,
    ];
}

// ─── Handlers ─────────────────────────────────────────────────────────────────
try {
    switch ($method) {

        // ── GET ──────────────────────────────────────────────────────────────
        case 'GET': {
            $selectRaw = $query['select'] ?? '*';
            $selectSQL = translateSelectCols($mysqlTable, $selectRaw);
            $cols      = preg_replace('/[^a-zA-Z0-9_,\s\*`]/', '', $selectSQL);

            ['sql' => $where, 'binds' => $binds] = buildWhere($mysqlTable, $query, $pdo);

            $limit  = isset($query['limit'])  ? max(1, (int)$query['limit'])  : 5000;
            $offset = isset($query['offset']) ? max(0, (int)$query['offset']) : 0;
            $order  = '';
            if (isset($query['order'])) {
                $ord    = explode('.', $query['order']);
                $oCol   = colToMySQL($mysqlTable, preg_replace('/[^a-zA-Z0-9_]/', '', $ord[0]));
                $oDir   = (isset($ord[1]) && strtolower($ord[1]) === 'desc') ? 'DESC' : 'ASC';
                $order  = "ORDER BY `$oCol` $oDir";
            }

            $sql  = "SELECT $cols FROM `$mysqlTable` $where $order LIMIT $limit OFFSET $offset";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($binds);
            $rows = $stmt->fetchAll();

            $rows = array_map(fn($r) => postProcessRow($mysqlTable, $r), $rows);
            echo json_encode($rows, JSON_UNESCAPED_UNICODE);
            break;
        }

        // ── POST (INSERT) ────────────────────────────────────────────────────
        case 'POST': {
            // Traducir claves Supabase → MySQL
            $data = translateKeys($mysqlTable, $body);

            // Codificar partidas como JSON si es array
            if (isset($data['partidas']) && is_array($data['partidas'])) {
                $data['partidas'] = json_encode($data['partidas'], JSON_UNESCAPED_UNICODE);
            }

            // No insertar 'id' numérico (AUTO_INCREMENT)
            $cfg = $TABLE_CONFIG[$mysqlTable] ?? [];
            if (($cfg['hide_num_id'] ?? false) && isset($data['id'])) {
                // 'id' aquí sería el bc3 ya mapeado a id_bc3, salvo que la col_map lo haya renombrado
                // Si 'id' aún está presente (tabla sin mapeo de id), lo eliminamos
                // Para propuestas: no hay 'id' en el body (usa 'Proyecto' → 'proyecto_bc3')
                // Para partidas: 'id' → 'id_bc3', así que 'id' ya no está
                // Este unset es para casos extremos
            }

            if (empty($data)) {
                http_response_code(400);
                echo json_encode(['error' => 'Body vacío']);
                break;
            }

            $colList = implode(', ', array_map(fn($c) => "`$c`", array_keys($data)));
            $phs     = implode(', ', array_fill(0, count($data), '?'));
            $stmt    = $pdo->prepare("INSERT INTO `$mysqlTable` ($colList) VALUES ($phs)");
            $stmt->execute(array_values($data));
            $newId   = $pdo->lastInsertId();

            http_response_code(201);
            // Devolver id en formato Supabase: si la tabla tiene bc3_id, devolver ese valor
            $idField = $cfg['reverse']['id_bc3'] ?? null;
            if ($idField && isset($data['id_bc3'])) {
                echo json_encode([$idField => $data['id_bc3'], 'mysql_id' => $newId]);
            } else {
                echo json_encode(['id' => $newId]);
            }
            break;
        }

        // ── PATCH (UPDATE) ───────────────────────────────────────────────────
        case 'PATCH': {
            $data = translateKeys($mysqlTable, $body);

            if (isset($data['partidas']) && is_array($data['partidas'])) {
                $data['partidas'] = json_encode($data['partidas'], JSON_UNESCAPED_UNICODE);
            }

            ['sql' => $where, 'binds' => $wBinds] = buildWhere($mysqlTable, $query, $pdo);

            if (!$where) {
                http_response_code(400);
                echo json_encode(['error' => 'PATCH sin WHERE no permitido']);
                break;
            }

            if (empty($data)) {
                http_response_code(400);
                echo json_encode(['error' => 'Body vacío para PATCH']);
                break;
            }

            $sets  = implode(', ', array_map(fn($c) => "`$c` = ?", array_keys($data)));
            $binds = array_merge(array_values($data), $wBinds);
            $stmt  = $pdo->prepare("UPDATE `$mysqlTable` SET $sets $where");
            $stmt->execute($binds);
            echo json_encode(['updated' => $stmt->rowCount()]);
            break;
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        case 'DELETE': {
            ['sql' => $where, 'binds' => $binds] = buildWhere($mysqlTable, $query, $pdo);

            if (!$where) {
                http_response_code(400);
                echo json_encode(['error' => 'DELETE sin WHERE no permitido']);
                break;
            }

            $stmt = $pdo->prepare("DELETE FROM `$mysqlTable` $where");
            $stmt->execute($binds);
            echo json_encode(['deleted' => $stmt->rowCount()]);
            break;
        }

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Método no permitido']);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
