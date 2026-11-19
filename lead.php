<?php
// Заявки с формы лендинга. Хранятся вне папки сайта (не попадают в Git и не видны из интернета).
// Файл: <папка домена>/private/friends-leads.csv  (Plesk → Файлы → private).
// Уведомление на почту: положите адрес в <папка домена>/private/notify-email.txt
header('Content-Type: text/plain; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit('POST only'); }
$raw = file_get_contents('php://input');
parse_str($raw, $in);
$in = array_merge($in, $_POST);
$clean = function ($v, $n) { $v = trim(preg_replace('/[\r\n\t]+/', ' ', (string)$v)); return mb_substr($v, 0, $n); };
$privateDir = function () {
  $dir = dirname(__DIR__) . '/private';
  if (!is_dir($dir) && !@mkdir($dir, 0700, true)) { $dir = __DIR__ . '/.leads'; @mkdir($dir, 0700, true); @file_put_contents($dir . '/.htaccess', "Require all denied\n"); }
  return $dir;
};
// Click on «Задать вопрос в WhatsApp»: no personal data, just which blogger page it came from.
if (($in['t'] ?? '') === 'wa') {
  $fh = @fopen($privateDir() . '/friends-wa-clicks.csv', 'a');
  if ($fh) { flock($fh, LOCK_EX); fputcsv($fh, [date('c'), $clean($in['b'] ?? 'site', 60), $clean($in['utm'] ?? '', 120)], ';'); flock($fh, LOCK_UN); fclose($fh); }
  exit('ok');
}
$name = $clean($in['name'] ?? '', 120);
$phone = $clean($in['phone'] ?? '', 40);
if ($name === '' || $phone === '') { http_response_code(400); exit('name and phone required'); }
$row = [date('c'), $name, $phone, $clean($in['biz'] ?? '', 200), $clean($in['b'] ?? 'site', 60), $clean($in['page'] ?? '', 300), $clean($in['utm'] ?? '', 120)];
foreach ($row as &$c) { if (preg_match('/^[=+\-@]/', $c) && !preg_match('/^\+[0-9 ()-]+$/', $c)) { $c = "'" . $c; } } unset($c);
$dir = $privateDir();
$file = $dir . '/friends-leads.csv';
$new = !file_exists($file);
$fh = @fopen($file, 'a');
if (!$fh) { http_response_code(500); exit('storage error'); }
flock($fh, LOCK_EX);
if ($new) { fwrite($fh, "\xEF\xBB\xBF"); fputcsv($fh, ['Дата', 'Имя', 'WhatsApp', 'Бизнес', 'Источник', 'Страница', 'Метка'], ';'); }
fputcsv($fh, $row, ';');
flock($fh, LOCK_UN); fclose($fh);
$to = @trim((string)@file_get_contents($dir . '/notify-email.txt'));
if ($to && filter_var($to, FILTER_VALIDATE_EMAIL)) {
  @mail($to, '=?UTF-8?B?' . base64_encode('Новая заявка Friends: ' . $name) . '?=',
    "Имя: $name\nWhatsApp: $phone\nБизнес: {$row[3]}\nИсточник: {$row[4]}\n", "Content-Type: text/plain; charset=utf-8");
}
echo 'ok';
