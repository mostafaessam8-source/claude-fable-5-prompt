# Three Strategy Smart Trading EA — دليل الاستخدام

> ⚠️ **تحذير المخاطر:** التداول بالرافعة المالية عالي المخاطر. **نتائج الباك تست لا تضمن أي أرباح مستقبلية.** جرّب الـ EA على حساب ديمو فترة كافية قبل أي استخدام على حساب حقيقي. نفس التحذير موجود داخل الكود.

## الملفات

| الملف | الوصف |
|---|---|
| `ThreeStrategySmartTradingEA.mq4` | الكود الكامل للـ EA (MQL4 فقط، بدون أي Indicator خارجي) |
| `Presets/Backtest_S1_Trendline_H1.set` | إعدادات باك تست للاستراتيجية الأولى فقط |
| `Presets/Backtest_S2_CandleRange_M5.set` | إعدادات باك تست للاستراتيجية الثانية فقط |
| `Presets/Backtest_S3_Liquidity_M15.set` | إعدادات باك تست للاستراتيجية الثالثة فقط |
| `Presets/Backtest_AllStrategies_M15.set` | الاستراتيجيات الثلاث معًا |

## التثبيت

1. انسخ `ThreeStrategySmartTradingEA.mq4` إلى المجلد `MQL4/Experts` (من MT4: File ← Open Data Folder).
2. افتح الملف في MetaEditor واضغط **F7 (Compile)**.
3. في MT4 فعّل زر **AutoTrading**، ثم اسحب الـ EA على الشارت وفعّل "Allow live trading".
4. انسخ ملفات `.set` إلى `MQL4/Presets`، ثم حمّلها من نافذة الإعدادات (Load) أو من Strategy Tester.

> ملاحظة: جهّزتُ الكود ليُترجم بدون أخطاء، وراجعته بأدوات فحص ثابتة (توازن الأقواس، وجود كل الدوال، أسماء الإعدادات في ملفات `.set`). لكن لم يكن هناك MetaEditor في بيئة التطوير. لو ظهر أي تحذير أو خطأ عند الترجمة (F7) أرسله لي وسأصلحه فورًا.

## مبادئ عامة في التصميم

- **الشمعة المغلقة فقط:** كل استراتيجية تُقيَّم مرة واحدة عند افتتاح شمعة جديدة على فريمها، وتقرأ الشمعة المغلقة (shift = 1) فقط.
- **بدون تكرار:** كل Setup له مفتاح (وقت الشمعة التي بدأت الإعداد). يُحفظ آخر مفتاح تم تداوله في Global Variable، فلا تتكرر الصفقة على نفس الإشارة ولو أُعيد تشغيل الـ EA. وهناك أيضًا حد "إشارة واحدة لكل شمعة لكل استراتيجية".
- **Magic Number مستقل:** لكل استراتيجية Magic، وللصفقات اليدوية من اللوحة Magic مستقل.
- **بدون Martingale أو Grid:** لا يوجد Grid إطلاقًا. أما مضاعفة اللوت بعد الخسارة (`UseLossMultiplier`) فهي **معطّلة افتراضيًا**، ولا تعمل إلا إذا فعّلتها بنفسك.
- **النقاط (Pips):** كل المسافات بالـ Pips. الـ Pip = 10 × Point في الوسطاء ذوي الخانات 3 و5، و= Point في الوسطاء ذوي الخانات 2 و4. للذهب والمؤشرات حدّد القيمة يدويًا عبر `PipSizeOverride` (مثلًا 0.1 للذهب). الاستثناء الوحيد هو `MinimumBreakoutPoints` فهو بالـ Points كما طلبت.
- **كل Chart مستقل:** يمكن تشغيل الـ EA على أكثر من رمز، وكل نسخة تدير رمز الشارت الخاص بها فقط. إذا شغّلت نسختين على **نفس الرمز** فاستخدم Magic Numbers مختلفة لكل نسخة.
- **القواعد غير المحسومة قابلة للتعديل:** أي قاعدة يمكن تفسيرها بأكثر من طريقة (نوع شمعة التأكيد، مرجع الـ Retest، شرط الإغلاق داخل النطاق بعد السحب، نسبة الدخول من الـ FVG، مصادر السيولة...) جعلتها Input ولم أفترض لها قيمة ثابتة.

> لم تصلني أي فيديوهات مرفقة مع الطلب، لذلك بُنيت القواعد على الوصف المكتوب فقط. إذا كان في الفيديو تفصيلة مختلفة، فغالبًا يمكن مطابقتها بتغيير Input. وإن لم يكن ذلك ممكنًا، أخبرني بها.

---

## شرح تشغيل كل استراتيجية

### Strategy 1 — Trendline + Marubozu Breakout + Retest

**مراحل الشراء** (البيع هو العكس تمامًا):

1. **الاتجاه السابق:** يبحث عن آخر قمتين Swing High (قوة القمة = `S1_SwingStrength` شمعة على كل جانب)، ويجب أن تكون الأحدث **أقل** من الأقدم (Lower High). إذا كان `S1_RequireStructureTrend=true` يُشترط أيضًا وجود Lower Low.
2. **خط الاتجاه:** يُرسم خط يمر بالقمتين ويمتد للأمام. يظهر منقطًا وهو "مرشح"، ويصبح متصلًا بعد الكسر.
3. **كسر قوي:** يجب أن تغلق الشمعة فوق الخط بمسافة `S1_MinBreakDistancePips` على الأقل، وأن تكون صاعدة، وأن تكون نسبة جسمها إلى مداها ≥ `MinBodyToRangeRatio` (شمعة Marubozu أو ذات جسم كبير). يمكن إضافة فلتر `S1_MinBodyATRMultiplier`. **يُرفض الكسر** إذا كان الخط قد كُسر بإغلاق سابق (لا نلحق كسرًا قديمًا).
4. **إعادة الاختبار:** ينتظر حتى `S1_MaxBarsForRetest` شمعة لعودة السعر إلى الخط، أو إلى مستوى الكسر، أو أيهما (حسب `S1_RetestMode`)، ضمن تسامح `S1_RetestTolerancePips`.
5. **التأكيد:** شمعة تأكيد صاعدة حسب `S1_ConfirmMode` (إغلاق اتجاهي، أو ابتلاعية، أو Pin Bar، أو أيٌّ منها)، ويجب أن تغلق فوق المستوى. يمكن أن تكون شمعة الـ Retest نفسها هي التأكيد إذا كان `S1_AllowSameBarConfirm=true`.
6. **الإلغاء:** يُلغى الإعداد إذا أغلقت شمعة تحت المستوى بأكثر من `S1_InvalidationPips`، أو إذا انتهت المهلة.

**SL:** `S1_SLMode` = أسفل شمعة الكسر، أو أسفل آخر Swing Low، أو ATR، مع إضافة `S1_SLBufferPips`.
**TP:** `S1_TPMode` = نسبة RR ثابتة، أو أقرب سيولة (قمم سابقة، Equal Highs، PDH)، أو TP يدوي من اللوحة. إذا لم توجد سيولة بنسبة RR ≥ `S1_MinRRForLiquidityTP` يُستخدم الـ RR الثابت.

### Strategy 2 — One Candle Range + MSS + FVG

1. **الشمعة المرجعية** على `ReferenceTimeframe` (افتراضيًا H1)، حسب `ReferenceCandleMode`:
   - `REF_LAST_CLOSED`: آخر شمعة مغلقة (النطاق يتجدد كل شمعة).
   - `REF_SPECIFIC_HOUR`: شمعة الساعة `S2_ReferenceHour` (بتوقيت السيرفر).
   - `REF_SESSION_FIRST` (الافتراضي): أول شمعة في الجلسة المحددة في `TradingSession`.
   - مع `S2_RequireSameDayReference=true` لا يُستخدم مرجع من يوم سابق.
2. يُرسم High وLow للشمعة المرجعية. الانتظار يتم على `EntryTimeframe` (M5 أو M15)، ويبدأ بعد إغلاق الشمعة المرجعية.
3. **المُحفِّز** حسب `S2_SetupMode`:
   - **Sweep (انعكاس):** للشراء، ذيل يكسر Low النطاق بمقدار `S2_MinSweepPips` (ويُغلق داخله إذا كان `S2_SweepRequireCloseInside=true`).
   - **Breakout (استمرار):** للشراء، أول إغلاق فوق High النطاق.
4. **MSS/BOS:** إغلاق فوق آخر Swing High على فريم الدخول بمقدار `S2_MinMSSBreakPips`، خلال `S2_MaxBarsForMSS` شمعة. في حالة الـ Breakout يكون كسر High النطاق نفسه هو الـ BOS.
5. **FVG:** بعد الـ MSS يبحث عن آخر FVG صاعد غير مملوء (Low الشمعة الثالثة > High الشمعة الأولى) بحجم ≥ `S2_MinFVGPips`، ويرسمه مستطيلًا.
6. **الدخول:** عند عودة السعر إلى مستوى الدخول داخل الـ FVG (`S2_EntryPercentOfFVG`: 0 = الحافة القريبة، 50 = المنتصف، 100 = الحافة البعيدة):
   - `FVG_ENTRY_CONFIRM_CLOSE` (الافتراضي): أمر Market بعد شمعة لمست المستوى وأغلقت في اتجاه الصفقة. **لا دخول بمجرد اللمس**.
   - `FVG_ENTRY_LIMIT_ORDER`: أمر Limit عند مستوى الدخول، ويُحذف تلقائيًا إذا انتهت المهلة أو فشل الـ FVG.
7. عدد الصفقات لكل نطاق يحدده `S2_MaxTradesPerRange`. ومع `S2_OnlyTradeInSession=true` لا تُقبل محفزات ولا دخول خارج الجلسة.

**SL:** خلف الـ FVG، أو خلف قاع السحب / آخر Swing، أو ATR، مع `S2_SLBufferPips`.
**TP:** الطرف المقابل من النطاق (وفي حالة الكسر يصبح Measured Move = الطرف + ارتفاع النطاق)، أو Liquidity Pool، أو RR ثابت.

### Strategy 3 — Liquidity + BOS + FVG

1. **السيولة** (تُحدَّث كل شمعة، ويبقى منها فقط المستويات التي لم تُلمس بعد):
   - Equal Highs / Equal Lows (قمتان أو قاعان بفارق ≤ `S3_EqualTolerancePips`).
   - آخر Swing High / Low.
   - High/Low اليوم السابق (PDH / PDL).
   - High/Low آخر جلسة مكتملة: آسيا، لندن، نيويورك.
2. **السحب:** للشراء، ذيل تحت مستوى سيولة سفلي بمقدار `S3_MinSweepPips`، مع إغلاق فوقه إذا كان `S3_RequireCloseBackInside=true`.
3. **BOS:** شمعة **تُغلق** فوق آخر Swing High قبل السحب بمقدار `MinimumBreakoutPoints` (بالنقاط) خلال `S3_MaxBarsForBOS`. الذيل وحده لا يُحتسب.
4. **FVG:** آخر FVG صاعد صالح تكوّن بعد السحب، ويُرسم على الشارت.
5. **الدخول:** نفس منطق الاستراتيجية الثانية (عودة وتأكيد، أو أمر Limit).

**SL:** تحت قاع السحب (السيولة)، أو تحت الـ FVG، أو ATR.
**TP:** أقرب سيولة مقابلة، أو RR ثابت، أو `S3_TP_PARTIAL_BE`: إغلاق `S3_PartialPercent`% عند `S3_PartialAtR` R، ثم نقل الـ SL إلى Break Even + `S3_BEOffsetPips`، ويبقى الباقي حتى TP بنسبة `S3_RiskReward`.

### رسائل عدم اكتمال الشروط

كل استراتيجية تكتب سبب الانتظار بوضوح، مثل: `waiting trendline break @1.08520` و`break candle body/range 0.42 < 0.60` و`waiting MSS close beyond 1.08110 (3/24)` و`FVG touched, waiting confirmation close` و`signal blocked - spread 3.4 > max 3.0 pips`.
تظهر هذه الرسائل في اللوحة الثانية، وتُسجَّل في Experts Log عند تغيّرها فقط (`LogConditionMessages`).

---

## شرح اللوحة الأولى — Trade Management Panel

| العنصر | الوظيفة |
|---|---|
| **Lot / SL / TP** | حجم اللوت، ووقف الخسارة، وجني الربح. الوحدة (Pips أو Price) يحددها زر UNIT |
| **Entry** | سعر الدخول للأوامر المعلّقة، وهو أيضًا المرجع عند التحويل بين Pips وPrice |
| **Ticket** | رقم صفقة محددة. القيمة 0 تعني "كل الصفقات" حسب `PanelActionScope` |
| **SL/TP UNIT** | التبديل بين Pips وPrice (مع تحويل القيم الحالية) |
| **DRAG LINES** | يُظهر خطوط Entry / SL / TP قابلة للسحب بالماوس، وعند سحبها تتحدث الخانات تلقائيًا |
| **PICK ENTRY / PICK SL / PICK TP** | اضغط الزر، ثم انقر على الشارت عند السعر المطلوب |
| **BUY MARKET / SELL MARKET** | فتح صفقة فورية باللوت وSL وTP المكتوبة (Magic = `MagicManual`) |
| **BUY / SELL PENDING @Entry** | أمر معلّق عند سعر Entry. يختار Limit أو Stop تلقائيًا حسب موقع السعر |
| **CLOSE ALL** | إغلاق كل الصفقات المفتوحة ضمن النطاق |
| **CLOSE BUY / CLOSE SELL** | إغلاق صفقات الشراء فقط / صفقات البيع فقط |
| **CLOSE PROFITABLE / CLOSE LOSING** | إغلاق الرابحة فقط / الخاسرة فقط |
| **BREAK EVEN** | نقل الـ SL إلى سعر الدخول + `BEOffsetPips` للصفقات التي تسمح أرباحها بذلك |
| **TRAILING ON/OFF** | تشغيل أو إيقاف الـ Trailing Stop (`TrailStartPips` / `TrailDistancePips` / `TrailStepPips`) |
| **PARTIAL CLOSE** | إغلاق `PartialClosePercent`% من حجم كل صفقة |
| **MODIFY SELECTED** | تطبيق SL/TP الحالية على الـ Ticket المحدد أو على كل الصفقات. الخانة الفارغة (0) تُبقي القيمة الحالية. مع Ticket لأمر معلّق وقيمة في Entry يُنقل سعر الأمر أيضًا |
| **DELETE PENDING** | حذف الأوامر المعلّقة |
| **S1 / S2 / S3 ON/OFF** | تشغيل أو إيقاف كل استراتيجية مباشرة من الشارت |
| **AUTO TRADING ON/OFF** | عند OFF تعمل اللوحة كأداة إدارة صفقات فقط (الإشارات تُكتشف ويُنبَّه لها إذا كان `AlertSignalsWhenAutoOff=true`) |
| **SHOW/HIDE STATS PANEL** | إظهار أو إخفاء اللوحة الثانية |
| **EMERGENCY CLOSE ALL** | يغلق **كل** الصفقات ويحذف **كل** الأوامر المعلّقة على **كل الرموز**، ويوقف التداول الآلي. يُطلب تأكيد قبل التنفيذ |
| زر **-** / **+** | تصغير اللوحة أو توسيعها |

> أزرار الإغلاق الخطرة تطلب تأكيدًا (`ConfirmPanelActions`). الأزرار لا تعمل في Strategy Tester، لأن MT4 لا يرسل أحداث الشارت هناك.

## شرح اللوحة الثانية — Performance & Position Panel

- **ACCOUNT:** Balance، Equity، Floating P/L، Closed Today، Total P/L، Spread، Margin، Free Margin، Margin Level، Daily DD، Max DD، Current DD.
- **POSITIONS:** عدد الصفقات (وعدد المعلّقة)، Buy/Sell، Buy Lots، Sell Lots، Net Lots = Buy − Sell، متوسط سعر الشراء والبيع، SL Exposure (مجموع الخسارة/الربح المؤمَّن إذا ضُرب الـ SL، ويظهر تحذير NO SL إذا وُجدت صفقة بلا SL)، و TP Expected.
- **STATISTICS:** عدد الصفقات الرابحة والخاسرة، و Win Rate، وحالة Auto Trading.
- **STRATEGIES:** حالة كل استراتيجية (`Active` / `Inactive` / `Waiting` / `Signal Detected`) مع سبب الانتظار الحالي.
- **Last Signal:** آخر إشارة ووقتها.
- **OPEN TRADES:** قائمة الصفقات المفتوحة، واسم الاستراتيجية التي فتحت كل صفقة.
- **الألوان:** الأخضر للربح والشراء، والأحمر للخسارة والبيع، والأصفر للتحذيرات، والأزرق للمعلومات.
- زر **x** يخفي اللوحة، ويمكن إظهارها من زر STATS في اللوحة الأولى.

> Total P/L وعدد الصفقات يعتمدان على ما يعرضه تبويب Account History في MT4. اختر "All History" ليشمل كل السجل.

## الرسومات على الشارت

| العنصر | المفتاح |
|---|---|
| Trendlines للاستراتيجية الأولى (منقط = مرشح، متصل = مكسور) | `ShowTrendlines` |
| High/Low الشمعة المرجعية للاستراتيجية الثانية | `ShowReferenceRange` |
| مستطيلات FVG | `ShowFVGZones` |
| مستويات السيولة ($ EQH، PDL، LON H...) | `ShowLiquidityLevels` |
| علامات BOS / MSS / SWEEP / BREAK / RETEST | `ShowStructureMarks` |
| خطوط Entry / SL / TP للصفقات والإشارات | `ShowTradeLevels` |
| أسهم Buy / Sell | `ShowSignalArrows` |
| اسم الاستراتيجية على كل إشارة | `ShowStrategyLabels` |
| Comment أعلى الشارت (اسم الـ EA، الاستراتيجيات النشطة، حالة Auto، عدد الصفقات، Floating، آخر إشارة) | `ShowChartComment` |

---

## شرح جميع الإعدادات (Inputs)

### GENERAL
| Input | الافتراضي | الشرح |
|---|---|---|
| EnableAutoTrading | true | حالة التداول الآلي عند التشغيل (يمكن تغييرها من اللوحة) |
| EnableStrategy1/2/3 | true | تفعيل كل استراتيجية عند التشغيل |
| TradeDirection | Both | السماح بالشراء والبيع، أو الشراء فقط، أو البيع فقط |
| MagicStrategy1/2/3 | 710001-3 | Magic مستقل لكل استراتيجية (يجب ألا تتكرر القيم) |
| MagicManual | 710000 | Magic صفقات اللوحة اليدوية |
| TradeCommentPrefix | TSSE | بادئة تعليق الأوامر |
| PipSizeOverride | 0 | حجم الـ Pip يدويًا (0 = تلقائي) |
| AlertSignalsWhenAutoOff | true | اكتشاف الإشارات والتنبيه بها حتى عندما يكون Auto = OFF |

### MONEY MANAGEMENT
| Input | الافتراضي | الشرح |
|---|---|---|
| LotMode | Risk % Equity | Fixed، أو نسبة من Equity، أو نسبة من Balance، أو مبلغ ثابت. في أوضاع المخاطرة يُحسب اللوت من المسافة بين Entry وSL |
| FixedLot | 0.01 | اللوت الثابت |
| RiskPercent | 1.0 | نسبة المخاطرة لكل صفقة |
| RiskMoney | 50 | مبلغ المخاطرة (وضع LOT_RISK_MONEY) |
| MinimumLot / MaximumLot | 0.01 / 5 | حدود اللوت الخاصة بك (مع حدود الوسيط). اللوت يُطبَّع حسب LotStep |
| MinFreeMarginAfterTrade | 0 | الحد الأدنى للهامش الحر بعد فتح الصفقة (فحص AccountFreeMarginCheck يعمل دائمًا) |
| DailyLossLimitPercent / Money | 5% / 0 | حد الخسارة اليومية (يُحسب من Equity بداية اليوم). عند الوصول إليه تُمنع الصفقات الجديدة |
| MaxDrawdownPercent | 20 | الحد الأقصى للتراجع من قمة الـ Equity |
| CloseAllOnRiskLimit | false | إغلاق صفقات الـ EA عند ضرب أي حد مخاطرة |
| MaxOpenTrades | 5 | أقصى عدد صفقات للـ EA على هذا الرمز |
| MaxTradesPerStrategy | 2 | أقصى عدد صفقات لكل استراتيجية |
| AllowHedging | false | السماح بوجود Buy وSell معًا |
| MaxSpreadPips | 3 | فلتر الاسبريد |
| MinStopLossPips / MaxStopLossPips | 5 / 0 | أقل وأكبر مسافة SL مسموحة (0 = بدون حد أقصى) |
| ManualTradesRespectLimits | true | تطبيق حدود المخاطرة على صفقات اللوحة اليدوية أيضًا |
| UseLossMultiplier | **false** | مضاعفة اللوت بعد الخسائر (Martingale). **خطير ومعطّل افتراضيًا** |
| LossMultiplier / MaxMultiplierSteps | 1.5 / 3 | معامل المضاعفة وأقصى عدد خطوات (لا يعملان إلا بعد التفعيل) |

> لإعادة تصفير قمة الـ Equity (لحساب Max DD) احذف Global Variable باسم `TSSE_PEAK_<رقم الحساب>` من (F3).

### TRADING HOURS (توقيت السيرفر)
| Input | الشرح |
|---|---|
| UseTradingHours | تفعيل فلتر الساعات |
| TradeStartHour/Minute, TradeEndHour/Minute | نافذة التداول (تدعم النوافذ التي تعبر منتصف الليل) |
| TradeOnMonday / TradeOnFriday | السماح بالتداول يومي الاثنين والجمعة |

### EXECUTION
| Input | الشرح |
|---|---|
| SlippagePoints | أقصى Slippage بالنقاط |
| MaxRetries / RetryDelayMs | إعادة المحاولة عند الأخطاء المؤقتة (Requote، Busy، Context busy، Price changed...) |
| UseECNMode | فتح الصفقة أولًا ثم وضع SL/TP (لبعض حسابات ECN) |
| AdjustStopsToBrokerLevel | إذا كان SL/TP داخل StopLevel يُدفع للخارج بدل رفض الأمر. FreezeLevel يُحترم عند التعديل والإغلاق |

### TRADE MANAGEMENT
| Input | الشرح |
|---|---|
| AutoManageScope | الصفقات التي يطبَّق عليها Trailing/BE التلقائي (صفقات الـ EA فقط، أو كل صفقات الرمز) |
| PanelActionScope | الصفقات التي تتأثر بأزرار اللوحة |
| StatsScope | الصفقات المحسوبة في الإحصائيات والرسم |
| UseTrailingStop, TrailStartPips, TrailDistancePips, TrailStepPips | الـ Trailing Stop (يتحرك في اتجاه الربح فقط) |
| UseAutoBreakEven, BETriggerPips, BEOffsetPips | Break Even تلقائي |
| PartialClosePercent | النسبة التي يغلقها زر PARTIAL CLOSE |

### STRATEGY 1
| Input | الشرح |
|---|---|
| S1_Timeframe | فريم الاستراتيجية (Current = فريم الشارت) |
| S1_SwingStrength / S1_SwingLookback | قوة القمة/القاع ومدى البحث |
| S1_MinSwingSeparation | أقل عدد شموع بين نقطتي الترند لاين |
| S1_RequireStructureTrend | اشتراط Lower Lows أو Higher Highs أيضًا |
| **MinBodyToRangeRatio** | نسبة جسم شمعة الكسر إلى مداها (Marubozu) |
| S1_MinBodyATRMultiplier | جسم الشمعة ≥ ATR × x (0 = معطّل) |
| S1_MinBreakDistancePips | مسافة الإغلاق خلف الخط |
| S1_RetestMode / S1_RetestTolerancePips / S1_MaxBarsForRetest | مرجع إعادة الاختبار، والتسامح، والمهلة |
| S1_ConfirmMode / S1_ConfirmMinBodyRatio | نوع شمعة التأكيد |
| S1_AllowSameBarConfirm / S1_MaxBarsForConfirm | السماح بأن تكون شمعة الـ Retest هي التأكيد، ومهلة التأكيد |
| S1_InvalidationPips | إلغاء الإعداد عند الإغلاق عكس الكسر |
| S1_SLMode / S1_SLBufferPips / S1_ATRPeriod / S1_ATRMultiplierSL | طريقة الـ SL |
| S1_TPMode / S1_RiskReward / S1_MinRRForLiquidityTP / S1_LiquidityLookback | طريقة الـ TP |

### STRATEGY 2
| Input | الشرح |
|---|---|
| **ReferenceTimeframe / EntryTimeframe** | فريم الشمعة المرجعية وفريم الدخول |
| **ReferenceCandleMode** / S2_ReferenceHour / S2_RequireSameDayReference | طريقة اختيار الشمعة المرجعية |
| **TradingSession** / S2_OnlyTradeInSession | الجلسة (London / New York / Asian / Custom) وتقييد الدخول بها |
| S2_SetupMode | Breakout أو Sweep أو كلاهما |
| S2_MinBreakPips / S2_MinSweepPips / S2_SweepRequireCloseInside | شروط الكسر والسحب |
| S2_SwingStrength / S2_StructureLookback / S2_MinMSSBreakPips / S2_MaxBarsForMSS | شروط الـ MSS |
| S2_MinFVGPips / S2_RequireDisplacement / S2_MaxBarsForFVG | شروط الـ FVG |
| S2_EntryMode / S2_EntryPercentOfFVG / S2_RequireConfirmation / S2_MaxBarsForRetest | طريقة الدخول |
| S2_InvalidateBeyondFVGPips | إلغاء الإعداد عند الإغلاق خلف الـ FVG |
| S2_MaxTradesPerRange | أقصى عدد صفقات لكل نطاق |
| S2_SLMode / S2_SLBufferPips / S2_ATRPeriod / S2_ATRMultiplierSL | الـ SL |
| S2_TPMode / S2_RiskReward / S2_MinRRForStructureTP / S2_LiquidityLookback | الـ TP |

### SESSIONS (توقيت السيرفر — عدّلها حسب توقيت الوسيط)
`AsianStartHour/EndHour`، `LondonStartHour/EndHour`، `NewYorkStartHour/EndHour`، `CustomStartHour/Minute`، `CustomEndHour/Minute`. تُستخدم في الاستراتيجية الثانية (الجلسة والشمعة المرجعية) وفي الاستراتيجية الثالثة (سيولة الجلسات).

### STRATEGY 3
| Input | الشرح |
|---|---|
| S3_Timeframe | فريم الاستراتيجية |
| S3_UseEqualHighsLows / S3_EqualTolerancePips | Equal Highs/Lows |
| S3_UsePreviousSwing / S3_UsePreviousDayHL | آخر Swing و PDH/PDL |
| S3_UseAsianSessionHL / S3_UseLondonSessionHL / S3_UseNewYorkSessionHL | سيولة الجلسات |
| S3_SwingStrength / S3_LiquidityLookback | قوة القمم ومدى البحث |
| S3_MinSweepPips / S3_RequireCloseBackInside | شروط السحب |
| **MinimumBreakoutPoints** / S3_StructureLookback / S3_MaxBarsForBOS | شروط الـ BOS (بالنقاط، بإغلاق الشمعة) |
| S3_MinFVGPips / S3_RequireDisplacement / S3_MaxBarsForFVG | الـ FVG |
| S3_EntryMode / S3_EntryPercentOfFVG / S3_RequireConfirmation / S3_MaxBarsForRetest / S3_InvalidateBeyondFVGPips | الدخول |
| S3_SLMode / S3_SLBufferPips / S3_ATRPeriod / S3_ATRMultiplierSL | الـ SL |
| S3_TPMode / S3_RiskReward / S3_MinRRForLiquidityTP | الـ TP |
| S3_PartialAtR / S3_PartialPercent / S3_BEOffsetPips | الإغلاق الجزئي و Break Even |

### ALERTS & LOG
`UseAlerts` (نافذة تنبيه)، `UsePushNotifications` (يتطلب MetaQuotes ID في الإعدادات)، `UseSoundAlerts` و`SoundFileName`، و`LogConditionMessages` (تسجيل أسباب عدم الدخول). كل أوامر OrderSend/Modify/Close ونتائجها وأخطاؤها تُسجَّل في Experts Log دائمًا.

### CHART VISUALIZATION و PANELS
مفاتيح الإظهار (راجع جدول الرسومات أعلاه)، و`DeleteObjectsOnExit`، وكل الألوان (`Clr*`)، ومواقع اللوحتين وأحجامهما (`TradePanelX/Y/Width`، `PerfPanelX/Y/Width`)، و`PerfMaxTradeRows`، و`PanelFontName`/`PanelFontSize`، و`ButtonHeight`، وألوان الأزرار، والقيم الافتراضية لخانات اللوحة (`DefaultPanelLot`/`SLPips`/`TPPips`)، و`ConfirmPanelActions`.

---

## الباك تست

1. افتح Strategy Tester (Ctrl+R)، واختر `ThreeStrategySmartTradingEA`.
2. **Model: Every tick**، والفترة سنة إلى سنتين على الأقل.
3. **الفريم:** S1 على H1، و S2 على M5، و S3 على M15 (حسب ملف الـ .set).
4. حمّل ملف الـ `.set` المناسب من زر Expert properties ← Load.
5. **تأكد من تحميل History** للفريمات الإضافية: الاستراتيجية الثانية تقرأ H1 وM5، والثالثة تقرأ D1 لـ PDH/PDL. نزّلها من History Center (F2).
6. أوقات الجلسات بتوقيت السيرفر. إذا كان السيرفر GMT+2 أو GMT+3 فعدّل ساعات London وNY.
7. استخدم Visual Mode لرؤية الترند لاين، والنطاق، والـ FVG، والسيولة، والإشارات.
8. للتحسين (Optimization) جرّب مثلًا: `MinBodyToRangeRatio` (0.5–0.8)، `S1_RiskReward` (1.5–3)، `S2_EntryPercentOfFVG` (0/50/100)، `MinimumBreakoutPoints`، `S3_MinFVGPips`. واحذر من الـ Overfitting.

> **نتائج الباك تست لا تضمن أرباحًا مستقبلية.** السبريد والانزلاق والتنفيذ الحقيقي تختلف عن التستر.
