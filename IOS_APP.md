# Trainy → iOS-приложение с виджетом

Всё готово на стороне репозитория. Дальше — шаги на Mac.

## Что уже сделано здесь

- `package.json` + `capacitor.config.json` — Capacitor-обёртка. Приложение грузит
  боевую версию с GitHub Pages, так что веб-обновления подтягиваются без пересборки.
- `www/index.html` — техническая заглушка (Capacitor требует папку webDir).
- `training-tracker.js` — при каждом обновлении экрана шлёт сводку виджету
  (`updateNativeWidget`): серия недель, тренировки за неделю, следующая тренировка.
- `ios-native/` — Swift-файлы, которые нужно добавить в Xcode:
  - `WidgetBridgePlugin.swift` — принимает данные из веба, кладёт в App Group;
  - `BridgeViewController.swift` — регистрирует плагин;
  - `TrainyWidget.swift` — сам виджет (малый и средний размеры).

## Шаги на Mac

### 0. Установить инструменты (один раз)

- Xcode из App Store (15+), запустить один раз и принять лицензию.
- Node.js LTS: https://nodejs.org
- CocoaPods не нужен (Capacitor 7 использует Swift Package Manager).

### 1. Склонировать и создать iOS-проект

```bash
git clone https://github.com/berenccc/personal-workout-tracker.git
cd personal-workout-tracker
npm install
npx cap add ios
npx cap open ios
```

Откроется Xcode с проектом `App`.

### 2. Подпись и App Group

1. Выбери проект **App** → таргет **App** → вкладка **Signing & Capabilities**.
2. Team — твой Apple ID (Xcode → Settings → Accounts, добавь Apple ID, если пусто).
3. Bundle Identifier поменяй на свой, например `com.<твоя-фамилия>.trainy`
   (`com.trainy.app` может быть занят).
4. Нажми **+ Capability** → **App Groups** → **+** → создай группу
   `group.<твой-bundle-id>`, например `group.com.ivanov.trainy`.

### 3. Добавить мост в приложение

1. Перетащи из папки `ios-native/` файлы `WidgetBridgePlugin.swift` и
   `BridgeViewController.swift` в Xcode, в группу `App/App`
   (галочка **Copy items if needed**, Target — **App**).
2. В обоих файлах замени `group.com.trainy.app` на свой App Group id.
3. Открой `App/App/Main.storyboard`, выбери **Bridge View Controller**,
   справа в Identity Inspector поставь **Class = BridgeViewController**.

### 4. Создать виджет

1. **File → New → Target… → Widget Extension**.
2. Product Name: `TrainyWidget`. Галочку **Include Configuration App Intent** сними. Finish → Activate.
3. В новой группе `TrainyWidget` замени содержимое основного swift-файла
   (`TrainyWidget.swift`) на код из `ios-native/TrainyWidget.swift`,
   замени `group.com.trainy.app` на свой App Group id.
   Остальные сгенерированные файлы (`*Bundle.swift`, `*Liveactivity.swift`, если есть) удали —
   в нашем файле уже есть `@main WidgetBundle`.
4. Таргет **TrainyWidget** → Signing & Capabilities → тот же Team →
   **+ Capability → App Groups** → отметь ту же группу.

### 5. Запуск

1. Подключи iPhone проводом, разреши доверие компьютеру.
2. Вверху Xcode выбери схему **App** и свой iPhone, нажми **Run** (▶).
3. На iPhone: Настройки → Основные → VPN и управление устройством →
   доверять своему сертификату разработчика.
4. Открой Trainy, войди в аккаунт — данные для виджета запишутся автоматически.
5. Долгий тап по домашнему экрану → **+** → найди Trainy → добавь виджет.

## Заметки

- Бесплатный Apple ID: приложение работает 7 дней, потом пересобрать. Платный
  аккаунт ($99/год) + TestFlight — сборка живёт 90 дней и ставится по ссылке.
- Виджет обновляется, когда открываешь приложение (плюс iOS сама перерисовывает
  его периодически). Данные хранятся локально в App Group.
- Обновления интерфейса приложения не требуют пересборки: обёртка грузит
  сайт с GitHub Pages. Пересборка нужна только при изменении Swift-кода.
