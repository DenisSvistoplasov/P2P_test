console.log("=== ТЕСТ: Воркер успешно загрузился и запустился в Webpack! ===");

self.addEventListener("message", (event) => {
  console.log("Воркер получил данные из React:", event.data);
  self.postMessage(`Привет из фонового потока! Ты прислал: ${event.data}`);
});