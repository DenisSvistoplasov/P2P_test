export const ToasterService = {
  showTime: 0,
  messages: [] as string[],
  handlers: [] as ((messages: string[]) => void)[],

  addMessage(message: string) {
    this.messages.push(message);
    this.handlers.forEach((handler) => handler(this.messages));
    this.showTime &&setTimeout(() => {
      this.messages.shift();
      this.handlers.forEach((handler) => handler(this.messages));
    }, this.showTime);
  },

  onChange(handler: (messages: string[]) => void) {
    this.handlers.push(handler);
  },
};

// Глобальный обработчик ошибок
window.onerror = function(message, source, lineno, colno, error) {
  const errorString = error?.toString() || String(message);
  const errorInfo = `Source: ${source}, Line: ${lineno}, Column: ${colno}`;
  
  // Ваша функция для обработки ошибок
  ToasterService.addMessage(errorString + '\n'+ errorInfo);
  
  console.error('Global error:', { message, source, lineno, colno, error });
  return true; // Предотвращает стандартное поведение
};

// Обработчик необработанных Promise-ошибок
window.addEventListener('unhandledrejection', (event) => {
  const errorString = event.reason?.toString() || 'Unhandled Promise Rejection';
  const errorInfo = event.reason?.stack || '';
  
  ToasterService.addMessage(errorString + '\n'+ errorInfo);
  console.error('Unhandled promise rejection:', event.reason);
});
