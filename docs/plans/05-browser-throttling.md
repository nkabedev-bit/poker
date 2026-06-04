# План работ: Устранение засыпания и троттлинга вкладки (Browser Throttling & Sound Fix)

## Проблема
Современные браузеры (Chrome, Safari, браузеры Smart TV) сильно замедляют выполнение таймеров JavaScript (`setInterval`/`setTimeout`) во вкладках без фокуса или при долгой неактивности пользователя. Это приводит к тому, что таймер на экране телевизора отстает, переключение блайндов происходит с задержкой, а звуковые сигналы (гонг) не воспроизводятся вовремя.

---

## Предлагаемое решение
1. **Использовать Screen Wake Lock API:** Чтобы не давать дисплею засыпать, а операционной системе — переводить браузер в энергосберегающий режим.
2. **Фоновое проигрывание звука:** Удержание аудио-контекста активным с помощью коротких беззвучных циклов.
3. **Использование Web Workers:** Перенос логики тика таймера в отдельный Web Worker, который не подвергается троттлингу со стороны браузера.

---

## Пошаговый план реализации

### Шаг 1. Внедрение Screen Wake Lock API
Добавить в `components/public/public-screen.tsx` хук для удержания экрана включенным:
```typescript
useEffect(() => {
  let wakeLock: WakeLockSentinel | null = null;

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        console.log("Wake Lock active");
      }
    } catch (err) {
      console.warn("Wake Lock failed to request:", err);
    }
  }

  requestWakeLock();

  // Повторный запрос при переключении вкладки обратно на экран
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible" && !wakeLock) {
      requestWakeLock();
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    wakeLock?.release();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, []);
```

### Шаг 2. Использование Web Worker для тика часов
Поскольку обычный `setInterval` троттлится, таймер можно вынести в Worker:
1. Создать легковесный инлайн-воркер в `components/public/public-screen.tsx`:
   ```typescript
   const createTimerWorker = () => {
     const code = `
       let intervalId = null;
       self.onmessage = (e) => {
         if (e.data === 'start') {
           intervalId = setInterval(() => self.postMessage('tick'), 1000);
         } else if (e.data === 'stop') {
           clearInterval(intervalId);
         }
       };
     `;
     const blob = new Blob([code], { type: "application/javascript" });
     return new Worker(URL.createObjectURL(blob));
   };
   ```
2. В основном `useEffect` компонента экрана блайндов использовать этот воркер вместо `setInterval`:
   ```typescript
   useEffect(() => {
     const worker = createTimerWorker();
     worker.postMessage("start");
     worker.onmessage = () => {
       // Вызываем корректировку времени с учетом offset
       setNow(getAdjustedDate());
     };
     return () => {
       worker.postMessage("stop");
       worker.terminate();
     };
   }, [clockOffset]);
   ```
Web Workers выполняются в отдельном системном потоке и браузеры не замедляют их интервалы до 1 минуты, как это происходит с фоновыми вкладками основного потока.

### Шаг 3. Верификация
1. Открыть публичный экран блайндов на тестовом устройстве (ноутбук или планшет).
2. Заблокировать устройство/переключить вкладку или оставить без движения на 20-30 минут.
3. Проверить, прозвучит ли звуковой сигнал гонга ровно в момент смены уровней по времени сервера.
4. Убедиться, что дисплей устройства не гаснет автоматически при открытой странице таймера.
