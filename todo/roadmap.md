# Roadmapa — Accountability Buddies

Spina pięć strumieni prac: push notifications, zaczepki, animacje + wibracje,
logowanie Google/Apple, drobne szlify. Szczegóły pushy i zaczepek żyją
w `todo/push-notifications.md` — ten dokument ustala **kolejność i zależności**,
nie powtarza tamtego planu.

## Stan wyjściowy (zweryfikowany 2026-09-01)

| Obszar | Stan |
| --- | --- |
| Testy | **zielone** — 23 suity, 122 testy, `tsc --noEmit` czysty |
| Push | zero infrastruktury; plan gotowy w `todo/push-notifications.md` |
| Haptyka | **1** wywołanie w repo (`hooks/useToggleGoal.tsx`) |
| Animacje | **1** plik używa Reanimated (`GoalList.tsx`, tylko swipe) |
| Logowanie | wyłącznie email + hasło + OTP (`useSignIn` / `useSignUp`) |
| Imiona | `profiles.full_name` puste u wszystkich → UI pokazuje „Unknown" |
| Bundle ID | `com.piotrplotast.accountabilitybuddies` — zmieniony i wprebuildowany 2026-09-02 |

## Jedna zależność, która porządkuje całość

```
zmiana bundle ID  →  Apple Developer Program ($99)  →  ┬→ push na iOS
                                                       └→ Sign in with Apple
```

Płatne konto Apple odblokowuje **dwie** z pięciu rzeczy naraz: uprawnienie
`aps-environment` (push) i capability „Sign in with Apple". Jedno zapisanie się,
dwie funkcje — dlatego oba strumienie planujemy razem, a nie osobno.

**Bundle ID zmieniamy zanim cokolwiek podepniemy pod Apple.** App ID, klucz APNs
`.p8`, Services ID i profile provisioningowe są przywiązane do identyfikatora.
Zmiana go po skonfigurowaniu credentiali oznacza przejście całej tej ścieżki
drugi raz — a to jedyny krok w projekcie, którego nie da się cofnąć jednym
commitem.

---

## E0 — Fundament (~pół dnia roboty + oczekiwanie na Apple)

Wszystko tu jest tanie, a odblokowuje resztę. Rób w tej kolejności.

1. ~~**Nowy bundle ID / package**~~ — **zrobione 2026-09-02.**
   `com.piotrplotast.accountabilitybuddies` w `app.json`, przeniesione prebuildem
   do natywnych projektów (`PRODUCT_BUNDLE_IDENTIFIER`, `namespace`/`applicationId`,
   katalog pakietu Javy), stary katalog usunięty. Fixture'y `.apns` i komendy
   `simctl push` w `todo/push-notifications.md` też zaktualizowane.
   Zero wystąpień starego ID w całym drzewie. **Credentiale Apple można ruszać.**
2. **Zapisz się do Apple Developer Program.** Akceptacja zwykle tego samego dnia,
   czasem 2–3 dni. Zrób to **pierwsze**, bo to jedyna rzecz z kolejką.
3. **Zmerguj `feature/supabase-cli-security-hardening` do `main`** i usuń 9
   nieaktywnych gałęzi lokalnych — startujemy nowe strumienie z czystego `main`.
4. ~~**Napraw CLAUDE.md**~~ — **zrobione 2026-09-02.** Nieaktualny baseline testów
   i akapit o inline'owym kluczu `heatmap` poprawione; doszedł akapit o tym, że
   `ios/`/`android/` to gitignorowany generowany output, a identyfikator zmienia
   się wyłącznie przez `app.json` + `prebuild --clean`.

**Zostało w E0:** punkty 2 i 3 — wniosek do Apple (zrób dziś, ma kolejkę) oraz
merge do `main` i sprzątnięcie gałęzi. Domknięcie etapu potwierdzasz jednym
uruchomieniem `npm run ios` na świeżym prebuildzie.

---

## E1 — Animacje i wibracje (~3–4 dni, **nie wymaga Apple**)

To jest praca na czas oczekiwania na akceptację Apple. Zero backendu, zero
credentiali, natychmiastowy efekt wizualny.

### Haptyka — najpierw jedno miejsce prawdy

`lib/haptics.ts` (nowy) — cienka warstwa nad `expo-haptics` z nazwami z domeny,
nie z API:

```ts
tapLight()      // każdy tap w liście / zakładce
toggleDone()    // odhaczenie nawyku      → NotificationFeedbackType.Success
toggleUndone()  // cofnięcie              → ImpactFeedbackStyle.Light
destructive()   // usunięcie nawyku       → Warning
celebrate()     // domknięcie całego dnia → sekwencja 2–3 impulsów
error()         // rollback z mutacji     → Error
```

Trzy zasady, które warto wpisać w ten plik jako komentarz:

- **Jedna flaga wyłączająca.** `hapticsEnabled` w `useTheme()` (obok `accent`,
  ten sam AsyncStorage) — haptyka to preferencja per-urządzenie, dokładnie jak
  kolor akcentu. Cała warstwa czyta flagę w jednym miejscu, call site'y nie.
- **Nigdy nie `await`.** Haptyka nie może opóźnić optimistic update. W
  `useOptimisticGoalMutation` wołamy ją w `beforeOptimistic` — ten hook już ma
  ten punkt zaczepienia.
- **Nie wibruj w odpowiedzi na dane serwera.** Wibracja potwierdza *dotyk
  użytkownika*. Wibrujące odświeżenie cache to duch w telefonie.

Podepnij pod: `useToggleGoal` (już jest — przenieś na warstwę), `useAddGoal`,
`useEditGoal`, `useDeleteGoal`, `MemberTabs`, `DayPicker`, `IconPicker`,
`onError` w `useOptimisticGoalMutation`.

### Animacje — cztery miejsca, które faktycznie coś dają

Reanimated 4 + `react-native-worklets` są już zainstalowane, `newArchEnabled`
jest `true` — czyli layout animations i `LinearTransition` działają od ręki.

1. **Odhaczenie nawyku** (`GoalList.tsx`) — spring na skali checkboxa + przejście
   koloru. Najczęstszy gest w aplikacji, więc największy zwrot.
2. **`ProgressRing`** — animowany `strokeDashoffset` zamiast skoku wartości.
   `useAnimatedProps` na `<Circle>` z `react-native-svg` (już w zależnościach).
3. **Reorganizacja listy** — `LinearTransition` na wierszach + `FadeIn`/`FadeOut`
   przy dodaniu/usunięciu. Dziś optimistic insert pojawia się skokowo.
4. **Domknięcie dnia** — jedna wyraźna nagroda, gdy ostatni zaplanowany nawyk
   wpada: puls pierścienia + `celebrate()`. To ten sam warunek „wszystko
   zrobione", który E5 wykorzysta do powiadomienia `buddy_done` — **wyciągnij go
   do czystej funkcji w `lib/`** (np. `isDayComplete(goals)`), bo posłuży dwa razy
   i tylko taka forma jest testowalna.

### Dostępność i testy

- `useReducedMotion()` z Reanimated → skracaj do przejść opacity. iOS
  „Ogranicz ruch" to realny setting, nie egzotyka.
- `jest.setup.js` już mockuje `expo-haptics` i reanimated globalnie, więc
  **asercje na haptyce są darmowe** — „odhaczenie woła `toggleDone`" to zwykły
  test. Samych animacji nie testujemy; testujemy `isDayComplete()`.

**Gotowe, gdy:** każda mutacja celu ma haptyczne potwierdzenie, cztery animacje
działają, flaga wyłączająca działa, reduced-motion respektowany.

---

## E2 — Tożsamość: imiona + Google/Apple (~4–5 dni, wymaga E0)

Kolejność w środku etapu jest istotna: **imiona przed OAuth, OAuth przed
zaczepkami.**

### Imiona (Faza 1 z `push-notifications.md`)

Bez tego każda zaczepka brzmi „Unknown zaczepił Cię". To nie jest osobna funkcja —
to warunek działania E4. Zakres bez zmian względem tamtego planu: pole „Twoje imię"
w `sign-up.tsx`, nowy `hooks/useUpdateProfile.ts`, edycja imienia w `Profile.tsx`,
serwerowy `coalesce()` jako siatka bezpieczeństwa dla istniejących kont.

### Sign in with Apple

`expo-apple-authentication` → `identityToken` → `supabase.auth.signInWithIdToken({
provider: "apple", token })`. Flow natywny, nie webowy — masz dev client, więc
nic nie stoi na przeszkodzie.

Trzy pułapki, każda kosztuje osobny dzień, jeśli się na nią wpadnie:

- **Apple podaje imię i nazwisko dokładnie raz** — przy pierwszej autoryzacji.
  Przy każdym kolejnym logowaniu pole jest puste, *także po reinstalacji
  aplikacji*. Zapis do `profiles` musi się wydarzyć w tym jednym przebiegu, bo
  drugiej szansy nie ma (odzyskanie wymaga ręcznego odpięcia aplikacji w
  ustawieniach Apple ID). To jest miejsce, gdzie warto dopisać komentarz w kodzie.
- **Nonce.** `expo-apple-authentication` przyjmuje nonce już zahashowany
  (SHA-256), a Supabase weryfikuje surowy. Wygeneruj raz, przekaż hash do Apple,
  surowy do Supabase — pomylenie tych dwóch daje mylący `invalid nonce`.
- **Private Relay.** Użytkownik może ukryć email; dostajesz adres
  `@privaterelay.appleid.com`. Wszystko, co zakłada „email = tożsamość" (np.
  fallback `split_part(u.email,'@',1)` z planu pushy) musi to znieść.

### Google

`@react-native-google-signin/google-signin` → `idToken` → ten sam
`signInWithIdToken`. Potrzebujesz **Web client ID** (to jego Supabase weryfikuje
jako audience) oraz iOS/Android client ID. Na Androidzie dochodzi odcisk SHA-1
klucza podpisującego — przy buildach EAS bierzesz go z `eas credentials`, nie
z lokalnego keystore'a.

### Konsekwencje produktowe

- **Kolejność sklepowa:** jeśli oferujesz logowanie Google, App Store oczekuje
  równoważnej opcji prywatnej — Sign in with Apple. Robimy Apple **przed** Google,
  żeby nigdy nie istniał build, który łamie ten warunek.
- **Ten sam email, dwie metody.** Supabase domyślnie linkuje konta po
  zweryfikowanym adresie, ale Apple z Private Relay da inny adres niż to samo
  konto założone hasłem — czyli **dwa konta, dwie osobne grupy**. Zdecyduj teraz,
  czy to akceptujesz, czy dodajesz jawne łączenie kont w profilu. Dla aplikacji
  z grupami rozjazd jest bolesny.
- **Usuwanie konta.** Logowanie stronami trzecimi w praktyce ściąga też wymóg
  ścieżki „usuń konto" w aplikacji. Zaplanuj RPC `delete_my_account` — pasuje
  do E6.

**Gotowe, gdy:** trzy metody logowania działają na fizycznym urządzeniu, imię jest
zapisane po każdej z nich, wylogowanie i ponowne logowanie zachowuje profil.

---

## E3 — Infrastruktura push (~3–4 dni, wymaga E0)

Fazy 0, 2, 3 i 7 z `todo/push-notifications.md`, bez zmian:
zależności i config plugin, migracja schematu (`device_push_tokens`,
`notification_prefs`, `notifications`, `goals.reminder_time`), rejestracja tokenu
i ekran ustawień, sprzątanie tokenów po `DeviceNotRegistered`.

Dwa akcenty, które wynikają z tej roadmapy:

- Etap kończy się **weryfikacją na fizycznym urządzeniu**, nie na symulatorze.
  Symulator ma pozostać pętlą iteracyjną dla deep linków (E4), ale nigdy bramką.
- Ekran ustawień powiadomień jest naturalnym miejscem na przełącznik haptyki
  z E1 — jeden ekran „Powiadomienia i sygnały", nie dwa.

---

## E4 — Zaczepki (~3 dni, wymaga E2 + E3)

Faza 4 z planu pushy: Edge Function `send-nudge` (weryfikacja wspólnej grupy,
rate limity 3/dzień na osobę i 15/dzień łącznie, sanityzacja do 140 znaków,
`dedupe_key`), `hooks/useSendNudge.ts`, `NudgeButton` + akcja swipe + `NudgeModal`,
oraz routing z tapnięcia w powiadomienie.

To jest **rdzeń produktu** — reszta pushy to obudowa. Jeśli budżet czasu się
skończy, to ten etap ma dojechać, a E5 może poczekać.

Jedna rzecz do przemyślenia przed kodowaniem: co widzi *nadawca*. Zaczepka wysłana
w próżnię (bez informacji „dostarczono", bez reakcji odbiorcy) szybko przestaje być
używana. Minimalna wersja: potwierdzenie w UI + haptyka `celebrate()` z E1.
Wersja pełna: reakcja jednym tapnięciem z poziomu powiadomienia. Wersja pełna to
osobny zakres — nie doklejaj jej do E4.

---

## E5 — Przypomnienia i zdarzenia społecznościowe (~3–4 dni, wymaga E3)

Fazy 5 i 6 z planu pushy: `goals.reminder_time` przeciągnięte przez pięć plików,
`TimePicker`, serwerowy `enqueue_due_reminders()` na `pg_cron`, dispatcher,
triggery na `logs` i `group_members`.

Powiązanie z E1: warunek „domknął dzień", który tam wyciągasz do `lib/`, jest
dokładnie tym samym warunkiem, na którym opiera się powiadomienie `buddy_done`.
Klient i SQL muszą się zgadzać co do definicji — w szczególności co do konwencji
`repeat_days` (Pn = 0), która w SQL brzmi `extract(isodow) - 1`.

---

## E6 — Szlify i wydanie (~2–3 dni)

Konkretne rzeczy znalezione w repo, nie ogólniki:

- **Biały splash w ciemnej aplikacji.** `app.json` ma
  `splash.backgroundColor: "#ffffff"` i `adaptiveIcon.backgroundColor: "#ffffff"`,
  a `themeColors.background` to `#18181B`. Każdy start aplikacji to biały błysk.
  Jedna linijka, najbardziej widoczny efekt w całym etapie.
- **Ikony wciąż z szablonu** (`assets/icon.png`, `adaptive-icon.png`,
  `splash-icon.png` — niezmieniane od grudnia). Do tego dojdzie
  `notification-icon.png` (biały na przezroczystym) wymagany przez Androida w E3.
- **Nazwa aplikacji** — `"accountabilitybuddies"` jednym słowem, taka wyświetli
  się pod ikoną. Warto rozdzielić `name` (widoczna) od `slug` (techniczna).
- **RPC `delete_my_account`** + wejście w profilu (patrz E2).
- **Stany puste i błędy sieci** — dziś błędy to `Alert.alert` z hooka mutacji.
  Przed sklepem warto mieć spójny stan „brak internetu" na dashboardzie.
- **`.env.example`** trzeba rozszerzyć o zmienne z E2/E3 (client ID Google,
  `EXPO_ACCESS_TOKEN`, `DISPATCH_SECRET` po stronie Supabase).
- **Gałąź `fix/accessibility`** — sprawdź, czy coś z niej jest nadal aktualne,
  zanim ją skasujesz w E0.

---

## Kolejność, gdyby trzeba było ciąć

1. **E0** — nienegocjowalne, blokuje wszystko i jest tanie.
2. **E1** — najlepszy stosunek efektu do ryzyka, zero zależności zewnętrznych.
3. **E2** — logowanie to pierwszy ekran; jednocześnie odblokowuje zaczepki.
4. **E3 + E4** — sedno produktu, ale najdroższe i najbardziej zależne.
5. **E5** — wartościowe, nie krytyczne przy pierwszym wydaniu.
6. **E6** — rozłóż na wszystkie etapy, zamiast zostawiać na koniec.

## Ścieżka krytyczna

```
E0 (bundle ID) ──► Apple Developer ──► E3 ──┐
     │                    │                 ├──► E4 (zaczepki)
     │                    └──► E2 (Apple) ──┘
     └──► E1 (animacje/haptyka) — równolegle, bez blokad
```

W praktyce: złóż wniosek do Apple w poniedziałek rano, rób E1 przez resztę
tygodnia, wejdź w E2/E3 gdy konto będzie aktywne.
