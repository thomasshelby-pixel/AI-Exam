export type ParakhCostLanguage = 'english' | 'hindi' | 'hinglish';
export type ParakhCostMode = 'answer' | 'example' | 'simpler' | 'quiz';

type LanguageContent = Record<ParakhCostLanguage, string>;
type CostChapter = {
  chapterNumber: number;
  title: string;
  aliases: string[];
  answer: LanguageContent;
  example: LanguageContent;
  simpler: LanguageContent;
  quiz: LanguageContent;
};

export const PARAKH_COST_SOURCE_URL = 'https://icai.org/post/24297';
export const PARAKH_COST_APPLICABILITY =
  'ICAI official Paper 4 catalogue page is headed Applicable for May 2027 Exam Onwards. Confirm the exact attempt edition, RTP, corrigendum and exclusions before relying on syllabus applicability.';

const CHAPTERS: CostChapter[] = [
  {
    chapterNumber: 1,
    title: 'Introduction to Cost and Management Accounting',
    aliases: ['introduction to cost and management accounting', 'cost accounting meaning', 'management accounting meaning', 'cost classification', 'cost centre', 'cost unit', 'cost object', 'cost accounting objectives', 'लागत लेखांकन का परिचय', 'लागत केंद्र'],
    answer: {
      english: 'Cost accounting identifies, measures, records, analyses and reports costs for products, services, activities and responsibility centres. Its main uses are cost ascertainment, cost control, efficiency measurement, pricing support and decision-making. Management accounting uses financial and non-financial information to help managers plan, control and choose between alternatives; it is broader than cost accounting. Financial accounting primarily reports stewardship and financial position/performance to external users under applicable requirements. Costs may be classified by element (material, employee, expenses), function (production, administration, selling, distribution), traceability (direct/indirect), behaviour (fixed, variable, semi-variable), controllability, normality and relevance to a decision. A cost object is anything for which a separate cost is measured; a cost unit expresses the quantity of service or output, while a cost centre is a location, person or item of equipment for which costs are accumulated. Distinguish a cost from an expense: cost is resource sacrifice for an objective; an expired or consumed cost charged against revenue is an expense. Classification depends on the question and purpose—fixed cost per unit changes with volume even when total fixed cost remains constant within the relevant range.',
      hinglish: 'Cost Accounting products, services, activities aur responsibility centres ki cost identify, measure, record aur analyse karta hai. Iska use cost ascertainment, cost control, efficiency, pricing aur decisions mein hota hai. Management Accounting planning/control/decision ke liye financial aur non-financial info use karta hai; scope wider hai. Financial Accounting external reporting par focus karta hai. Cost ko element (material, employee, expenses), function (production/admin/selling), traceability (direct/indirect), behaviour (fixed/variable/semi-variable), controllability, normality aur relevance se classify karte hain. Cost object woh item hai jiske liye cost measure ho; cost unit output/service ki unit hai; cost centre woh location/person/equipment hai jahan cost collect hoti hai. Fixed cost total relevant range mein constant reh sakti hai, lekin per-unit fixed cost volume badhne par kam hoti hai. Classification question ke purpose ke hisaab se karo.',
      hindi: 'Cost Accounting products, services, activities और responsibility centres की लागत पहचानने, मापने, record और analyse करने की प्रक्रिया है। इसका उपयोग cost ascertainment, cost control, efficiency measurement, pricing और decisions में होता है। Management Accounting planning, control और decisions के लिए financial तथा non-financial information देता है; इसका scope अधिक व्यापक है। Cost को element (material, employee, expenses), function (production/admin/selling), traceability (direct/indirect), behaviour (fixed/variable/semi-variable), controllability, normality और decision relevance से classify किया जा सकता है। Cost object वह item है जिसके लिए अलग cost मापी जाती है; cost unit output/service की इकाई है; cost centre वह location, person या equipment है जहाँ costs collect होती हैं। Relevant range में total fixed cost स्थिर रह सकती है, लेकिन per-unit fixed cost volume बढ़ने पर घटती है।',
    },
    example: {
      english: 'A hospital measures the cost of one inpatient day. The cost object is the inpatient service; the cost unit is one patient-day; a ward may be a cost centre. Ward nursing supplies traceable to a patient may be direct, while ward rent may be indirect to an individual patient. The classification changes with the cost object.',
      hinglish: 'Hospital mein ek inpatient day ki cost measure karni hai: cost object inpatient service, cost unit one patient-day aur ward cost centre ho sakta hai. Patient-specific medicine direct cost ho sakti hai; ward rent individual patient ke liye indirect. Cost object change hote hi direct/indirect classification bhi change ho sakti hai.',
      hindi: 'Hospital में एक inpatient day की cost मापनी है। Cost object inpatient service, cost unit एक patient-day और ward cost centre हो सकता है। Patient-specific medicine direct हो सकती है, जबकि ward rent individual patient के लिए indirect हो सकती है।',
    },
    simpler: {
      english: 'Cost accounting answers “what did this product or service really cost?” Management accounting asks “what should managers do next?” A cost unit is the unit of output; a cost centre is where costs are collected.',
      hinglish: 'Cost Accounting poochta hai product/service banane ki actual cost kya thi. Management Accounting poochta hai manager ko next kya decision lena chahiye. Cost unit output ki unit hai; cost centre cost collect karne ki jagah/team hai.',
      hindi: 'Cost Accounting बताता है कि product या service की लागत कितनी थी। Management Accounting manager को अगला निर्णय लेने में मदद करता है। Cost unit output की इकाई है और cost centre वह स्थान/टीम है जहाँ लागत collect होती है।',
    },
    quiz: {
      english: 'A factory supervisor’s salary is fixed for the month but can be traced to one production department. Classify it by behaviour and traceability, and state why these classifications are not contradictory.',
      hinglish: 'Factory supervisor ki monthly salary fixed hai aur ek production department se trace ho sakti hai. Behaviour aur traceability ke basis par classify karo; dono classifications contradictory kyun nahi hain?',
      hindi: 'Factory supervisor का monthly salary fixed है और एक production department से trace हो सकता है। Behaviour तथा traceability के आधार पर classify करें और बताएँ कि दोनों classifications में विरोध क्यों नहीं है।',
    },
  },
  {
    chapterNumber: 2,
    title: 'Material Cost',
    aliases: ['material cost', 'material control', 'economic order quantity', 'eoq', 'reorder level', 'minimum level', 'maximum level', 'stock level', 'stores ledger', 'fifo', 'lifo', 'weighted average', 'abc analysis', 'मटेरियल कॉस्ट', 'आर्थिक आदेश मात्रा'],
    answer: {
      english: 'Material cost control aims to obtain the right quality and quantity at the right time and price while avoiding excess investment, stock-outs, deterioration and losses. The control cycle covers purchase requisition, supplier selection and purchase order, receipt/inspection, stores custody, issue authorisation and records. Inventory levels should reflect usage and lead time. Re-order level is commonly maximum usage × maximum lead time; minimum and maximum levels are set using usage, lead time and order size. EOQ balances ordering cost against carrying cost: EOQ = √(2AO/C), where A is annual demand, O is ordering cost per order and C is annual carrying cost per unit. This basic formula assumes predictable demand and lead time, constant relevant costs and no quantity discounts; revise assumptions when they do not hold. Stores issue pricing methods such as FIFO and weighted average affect material cost charged to production and closing inventory. ABC analysis prioritises items by annual consumption value, not by physical size or number of units. Reconcile physical stock with records and investigate shortages, scrap, wastage and abnormal losses separately.',
      hinglish: 'Material control ka aim right quality/quantity ko right time aur price par lena hai—excess stock, stock-out aur losses avoid karte hue. Cycle: purchase requisition, supplier selection/order, receipt-inspection, stores custody, authorised issue aur records. Re-order level often maximum usage × maximum lead time hota hai; min/max level usage, lead time aur order size par depend karte hain. EOQ ordering aur carrying cost balance karta hai: √(2AO/C), jahan A annual demand, O per order ordering cost, C per-unit annual carrying cost. Formula predictable demand/lead time aur constant costs assume karta hai. FIFO/weighted average issue price aur closing stock value affect karte hain. ABC analysis annual consumption value par priority deta hai, item count par nahi. Physical stock ko records se reconcile karo; abnormal loss ko normal usage se alag rakho.',
      hindi: 'Material control का उद्देश्य सही quality और quantity को सही समय तथा उचित price पर प्राप्त करना है, ताकि excess stock, stock-out और losses न हों। प्रक्रिया में purchase requisition, supplier selection, order, receipt/inspection, stores custody, authorised issue और records शामिल हैं। Re-order level सामान्यतः maximum usage × maximum lead time से निकाला जाता है। EOQ ordering तथा carrying cost के बीच संतुलन बनाता है: √(2AO/C), जहाँ A annual demand, O प्रति order ordering cost और C प्रति unit annual carrying cost है। यह basic formula predictable demand/lead time और स्थिर relevant costs मानता है। FIFO और weighted average issue cost तथा closing inventory को प्रभावित करते हैं। ABC analysis annual consumption value पर items को prioritise करता है।',
    },
    example: {
      english: 'Annual demand is 10,000 units, ordering cost ₹200 per order and annual carrying cost ₹5 per unit. EOQ = √(2 × 10,000 × 200 ÷ 5) = √800,000 ≈ 894 units. This is a model estimate, not an instruction to order 894 when supplier pack sizes, capacity or quantity discounts make another lot size more economical.',
      hinglish: 'Annual demand 10,000 units, ordering cost ₹200/order aur carrying cost ₹5/unit/year hai. EOQ = √(2×10,000×200÷5) = √800,000 ≈ 894 units. Ye model-based estimate hai; supplier pack size, storage capacity aur discount bhi check karna.',
      hindi: 'Annual demand 10,000 units, ordering cost ₹200 प्रति order और carrying cost ₹5 प्रति unit प्रति वर्ष है। EOQ = √(2×10,000×200÷5) = √800,000 ≈ 894 units। यह अनुमान है; supplier pack size, capacity और quantity discount भी जाँचें।',
    },
    simpler: {
      english: 'Order too often and ordering cost rises. Order too much and storage/carrying cost rises. EOQ is the order size that balances these two costs under stated assumptions.',
      hinglish: 'Bahut baar order karoge toh ordering cost badhegi; bahut zyada order karoge toh storage cost badhegi. EOQ dono ko balance karne wali quantity hai—assumptions valid hone chahiye.',
      hindi: 'बार-बार order करने से ordering cost बढ़ती है; बहुत अधिक stock रखने से carrying cost बढ़ती है। EOQ इन दोनों के बीच संतुलन बनाता है, कुछ assumptions के अंतर्गत।',
    },
    quiz: {
      english: 'A firm has stable annual demand but supplier lead time has become highly uncertain. Explain why the basic EOQ alone cannot determine a safe reorder point and identify the additional information needed.',
      hinglish: 'Demand stable hai but supplier lead time uncertain ho gaya. Samjhao basic EOQ akela safe reorder point kyun nahi batata aur kaunsi extra info chahiye.',
      hindi: 'Demand स्थिर है, लेकिन supplier lead time बहुत uncertain हो गया है। समझाएँ कि basic EOQ अकेले safe reorder point क्यों नहीं बताता और कौन-सी अतिरिक्त information चाहिए।',
    },
  },
  {
    chapterNumber: 3,
    title: 'Employee Cost and Direct Expenses',
    aliases: ['employee cost', 'labour cost', 'labour turnover', 'idle time', 'overtime', 'time rate', 'piece rate', 'halsey plan', 'rowan plan', 'direct expenses', 'labour remuneration', 'कर्मचारी लागत', 'श्रम लागत'],
    answer: {
      english: 'Employee cost includes wages/salaries and other employment-related costs attributable to the cost object under the applicable costing policy. Control begins with manpower planning, attendance/time recording, job or process time booking, payroll preparation and independent checks. Direct labour is economically traceable to a product/job; indirect labour supports production but is not conveniently traceable to one unit. Remuneration may be time-based, output-based or incentive-based. Under a Halsey plan, a worker receives time wages plus an agreed share of the time saved; under a Rowan plan, the bonus is linked to the proportion of time saved to standard time, limiting excessive bonus at very high savings. State the exact formula and terms supplied by the question. Idle time is time paid but not productively used; normal idle time may be absorbed in production overhead, while abnormal idle time is generally separately identified. Overtime premium treatment depends on cause and costing policy: production-specific overtime may be charged to the job, whereas general overtime may be overhead. Direct expenses are expenses other than direct material and direct labour that can be traced to a particular cost unit/job.',
      hinglish: 'Employee cost mein wages/salary aur relevant employment costs aate hain. Control: manpower planning, attendance/time record, job-wise time booking, payroll aur independent checking. Direct labour product/job se trace hota hai; indirect labour production support karta hai. Remuneration time-rate, piece-rate ya incentive ho sakta hai. Halsey plan mein time wages + time saved ka agreed share; Rowan plan mein bonus time saved/standard time ke proportion se link hota hai. Question mein diye exact formula follow karo. Idle time paid but unproductive time hai; normal idle time production overhead mein absorb ho sakta hai, abnormal idle time separately identify hota hai. Overtime premium cause/policy ke basis par job ya overhead mein charge ho sakta hai. Direct expenses woh traceable expenses hain jo direct material/labour ke alawa hote hain.',
      hindi: 'Employee cost में wages/salary और संबंधित employment costs शामिल होते हैं। Control में manpower planning, attendance/time recording, job-wise time booking, payroll और independent checking आते हैं। Direct labour product/job से trace होता है; indirect labour production को support करता है। Remuneration time-rate, piece-rate या incentive-based हो सकता है। Halsey plan में time wages के साथ time saved का agreed share मिलता है; Rowan plan में bonus का संबंध time saved और standard time के अनुपात से होता है। Idle time paid लेकिन unproductive time है। Normal idle time production overhead में absorb हो सकता है; abnormal idle time अलग identify किया जाता है। Direct expenses वे traceable expenses हैं जो direct material और direct labour के अतिरिक्त होते हैं।',
    },
    example: {
      english: 'Standard time is 10 hours, actual time is 8 hours and time rate is ₹100/hour. Under a 50% Halsey share, time wages = ₹800 and bonus = 50% × 2 × ₹100 = ₹100, so total wages = ₹900. Under Rowan, bonus = (2/10) × 8 × ₹100 = ₹160, so total = ₹960. Use only the incentive plan specified in the question.',
      hinglish: 'Standard 10 hours, actual 8 hours, rate ₹100/hour. 50% Halsey: time wages ₹800 + bonus 50%×2×100=₹100; total ₹900. Rowan: bonus (2/10)×8×100=₹160; total ₹960. Exam mein plan jo diya ho wahi formula apply karo.',
      hindi: 'Standard time 10 घंटे, actual time 8 घंटे और rate ₹100 प्रति घंटा है। 50% Halsey में wages ₹800 और bonus ₹100, total ₹900। Rowan में bonus (2/10)×8×100 = ₹160, total ₹960। प्रश्न में दिया plan ही लागू करें।',
    },
    simpler: {
      english: 'Direct labour can be traced to a job; indirect labour supports many jobs. Idle time is paid time without productive output. Incentive plans reward efficiency, but use the exact plan and formula given.',
      hinglish: 'Direct labour ko job se trace kar sakte ho; indirect labour multiple jobs ko support karta hai. Idle time paid time hai jisme output nahi hua. Incentive plan efficiency reward karta hai—question ka exact formula use karo.',
      hindi: 'Direct labour को job से trace कर सकते हैं; indirect labour कई jobs को support करता है। Idle time paid time है जिसमें productive output नहीं हुआ। Incentive plan में दिए गए exact formula का उपयोग करें।',
    },
    quiz: {
      english: 'An operator’s overtime is caused by a special urgent order requested by one customer. Discuss how the overtime premium may be treated and what fact would change the answer.',
      hinglish: 'Operator ka overtime ek customer ke urgent special order ke karan hua. Overtime premium ka treatment discuss karo aur batao kaunsi fact se treatment badlega.',
      hindi: 'एक operator का overtime एक customer के urgent special order के कारण हुआ। Overtime premium का treatment बताइए और कौन-सी fact से treatment बदल सकता है?',
    },
  },
  {
    chapterNumber: 4,
    title: 'Overheads – Absorption Costing Method',
    aliases: ['overheads absorption costing method', 'overhead allocation', 'overhead apportionment', 'overhead absorption', 'machine hour rate', 'under absorption', 'over absorption', 'factory overhead', 'लागत उपरिव्यय', 'ओवरहेड अवशोषण'],
    answer: {
      english: 'Overheads are indirect costs that cannot be economically traced to a single cost unit. Accumulation groups overheads by cost centre; allocation charges a whole item to one centre; apportionment shares common costs among centres on a logical basis; absorption charges production overheads to cost units using an absorption rate. Bases should reflect cause or benefit where possible—floor area for rent, headcount for canteen costs, machine hours for machine-related costs. A predetermined rate may be calculated as budgeted overhead ÷ budgeted activity. Compare overhead absorbed with actual overhead: under-absorption occurs when absorbed overhead is lower; over-absorption when higher. Investigate volume, spending and efficiency reasons before disposing of the difference under the applicable policy. Machine-hour rate can include standing charges per hour plus running costs per machine hour. Avoid using one blanket rate when departments or products consume overheads differently.',
      hinglish: 'Overheads indirect costs hain jo ek cost unit se economically trace nahi hote. Accumulation centre-wise collection; allocation ek centre ko full charge; apportionment common cost ko logical basis se share; absorption production overhead ko cost units par charge karta hai. Base cause/benefit reflect kare—rent ke liye area, machine overhead ke liye machine hours. Predetermined rate = budgeted overhead ÷ budgeted activity. Absorbed overhead actual se kam ho toh under-absorption; zyada ho toh over-absorption. Difference treat karne se pehle volume, spending aur efficiency reason analyse karo. Different departments ka overhead usage alag ho toh one blanket rate avoid karo.',
      hindi: 'Overheads indirect costs हैं जिन्हें एक cost unit से economically trace नहीं किया जा सकता। Accumulation में centre-wise collection, allocation में पूरा item एक centre को, apportionment में common cost logical basis से centres में बाँटना और absorption में production overhead को cost units पर charge करना शामिल है। Base cause या benefit से जुड़ा होना चाहिए, जैसे rent के लिए floor area और machine overhead के लिए machine hours। Predetermined rate = budgeted overhead ÷ budgeted activity। Absorbed overhead actual से कम हो तो under-absorption और अधिक हो तो over-absorption है। अंतर का treatment करने से पहले volume, spending और efficiency reasons analyse करें।',
    },
    example: {
      english: 'Budgeted production overhead is ₹6,00,000 and budgeted machine hours are 30,000. Predetermined absorption rate = ₹20 per machine hour. A job using 40 machine hours absorbs ₹800 overhead. At period end compare total absorbed overhead with actual overhead and investigate the difference.',
      hinglish: 'Budget overhead ₹6,00,000 aur 30,000 machine hours hai. Rate ₹20/machine hour. Job ne 40 hours use kiye, toh absorbed overhead ₹800. Period end par total absorbed ko actual overhead se compare karke variance ka reason analyse karo.',
      hindi: 'Budgeted overhead ₹6,00,000 और machine hours 30,000 हैं। Rate ₹20 प्रति machine hour है। 40 घंटे उपयोग करने वाले job पर ₹800 overhead absorb होगा।',
    },
    simpler: {
      english: 'Overhead is indirect. First collect it, then share it fairly among departments, then charge it to products using a suitable rate.',
      hinglish: 'Overhead indirect hai. Pehle collect karo, phir departments mein fair basis se divide karo, phir suitable rate se product/job par charge karo.',
      hindi: 'Overhead indirect cost है। पहले collect करें, फिर उचित आधार पर departments में बाँटें और suitable rate से product/job पर charge करें।',
    },
    quiz: {
      english: 'Two departments use very different machine hours but receive overhead using direct labour hours. Explain why the basis may distort product costs and recommend a more causal allocation basis.',
      hinglish: 'Do departments ke machine hours bahut different hain, par overhead labour hours se absorb ho raha hai. Batao distortion kyun ho sakta hai aur better causal base kya hoga.',
      hindi: 'दो departments के machine hours बहुत अलग हैं, लेकिन overhead direct labour hours से absorb हो रहा है। इससे product cost distort क्यों हो सकती है और कौन-सा बेहतर causal base होगा?',
    },
  },
  {
    chapterNumber: 5,
    title: 'Activity Based Costing',
    aliases: ['activity based costing', 'abc costing', 'activity cost pool', 'cost driver', 'activity driver', 'traditional costing versus abc', 'एबीसी कॉस्टिंग', 'गतिविधि आधारित लागत'],
    answer: {
      english: 'Activity Based Costing (ABC) assigns overheads to activities first and then assigns activity costs to products or services using cost drivers. The steps are: identify significant activities; create activity cost pools; select a suitable driver for each pool; calculate driver rate (pool cost ÷ driver volume); and assign cost to cost objects based on driver consumption. A transaction driver counts events (purchase orders), a duration driver measures time (inspection hours), and an intensity driver directly charges resources where measurement is practical. ABC can improve cost visibility where products differ in batch size, complexity, setups or support requirements. It is not automatically superior in every setting: data collection can be expensive, drivers can be poorly chosen and cost-benefit should be considered. A driver should have a plausible cause-and-effect relationship with the activity cost.',
      hinglish: 'ABC mein pehle overheads activities ko assign hote hain, phir cost driver ke basis par product/service ko. Steps: activities identify; activity cost pools banao; suitable driver choose; driver rate = pool cost ÷ driver volume; product ko driver consumption ke basis par cost assign. Transaction driver events count karta hai (purchase orders), duration driver time (inspection hours), intensity driver directly resource charge karta hai. ABC tab useful hai jab products batch size, complexity, setups ya support needs mein different hon. Data collection expensive ho sakta hai; driver ka causal link genuine hona chahiye aur cost-benefit assess karo.',
      hindi: 'ABC में पहले overheads को activities में assign किया जाता है और फिर cost drivers के आधार पर products/services को। Steps: activities identify करें; activity cost pools बनाएँ; suitable driver चुनें; driver rate = pool cost ÷ driver volume; फिर driver consumption के अनुसार cost assign करें। Transaction driver events गिनता है, duration driver समय मापता है और intensity driver जहाँ संभव हो direct resource charge करता है। ABC उन स्थितियों में उपयोगी है जहाँ products की batch size, complexity, setups या support requirements अलग हों। Data collection की लागत भी जाँचें और driver का activity cost से causal link होना चाहिए।',
    },
    example: {
      english: 'Setup activity costs ₹1,20,000 for 60 setups, so rate = ₹2,000 per setup. Product A uses 10 setups and is assigned ₹20,000; Product B uses 50 setups and is assigned ₹1,00,000. A volume-only labour-hour rate might hide this difference.',
      hinglish: 'Setup pool ₹1,20,000 aur 60 setups: rate ₹2,000/setup. Product A 10 setups use karta hai—₹20,000; Product B 50—₹1,00,000. Labour-hour basis is difference ko hide kar sakta hai.',
      hindi: 'Setup activity cost ₹1,20,000 और setups 60 हैं; rate ₹2,000 प्रति setup। Product A के 10 setups पर ₹20,000 और Product B के 50 setups पर ₹1,00,000 assign होंगे।',
    },
    simpler: {
      english: 'ABC asks what activities caused overhead and how much each product used those activities. It is more detailed than spreading all overhead using one volume base.',
      hinglish: 'ABC poochta hai overhead kis activity se aaya aur har product ne activity kitni use ki. One rate sab products par lagane se zyada detailed method hai.',
      hindi: 'ABC पता करता है कि overhead किस activity से आया और हर product ने उस activity का कितना उपयोग किया।',
    },
    quiz: {
      english: 'A low-volume customised product requires many engineering changes and inspections. Explain why a single labour-hour absorption rate may understate its cost and identify two suitable ABC drivers.',
      hinglish: 'Low-volume customised product mein engineering changes aur inspections bahut hain. Labour-hour rate cost understate kyun kar sakta hai? Do ABC drivers suggest karo.',
      hindi: 'एक low-volume customised product में engineering changes और inspections अधिक हैं। Labour-hour rate इसकी cost कम क्यों दिखा सकता है? दो उपयुक्त ABC drivers बताएँ।',
    },
  },
  {
    chapterNumber: 6,
    title: 'Cost Sheet',
    aliases: ['cost sheet', 'statement of cost', 'prime cost', 'works cost', 'factory cost', 'cost of production', 'cost of goods sold', 'cost of sales', 'लागत पत्रक', 'प्राइम कॉस्ट'],
    answer: {
      english: 'A cost sheet presents cost for a period or cost unit in a structured statement. A typical manufacturing sequence is: direct material consumed + direct labour + direct expenses = prime cost; add factory/works overhead and adjust opening and closing work-in-progress = works cost; add production-related administration overhead = cost of production; adjust finished goods inventory = cost of goods sold; add selling and distribution overhead = cost of sales. Some questions use different headings or treatment, so follow the specified format and identify whether overhead is production, administration, selling or distribution. Direct material consumed is opening raw material + purchases and inward costs − purchase returns − closing raw material, subject to the question’s data. A cost sheet is not automatically a financial statement; it is a management/costing statement and must reconcile its definitions with the question.',
      hinglish: 'Cost sheet period ya cost unit ki cost structured format mein dikhata hai. Sequence: direct material consumed + direct labour + direct expenses = prime cost; factory overhead add karke opening WIP add/closing WIP less = works cost; production admin overhead add = cost of production; opening finished goods add/closing finished goods less = cost of goods sold; selling/distribution overhead add = cost of sales. Question ka format follow karo. Material consumed = opening raw material + purchases/inward charges − returns − closing raw material. Overhead ko function ke basis par correct place par rakho.',
      hindi: 'Cost sheet किसी period या cost unit की लागत को structured statement में दिखाता है। सामान्य sequence: direct material consumed + direct labour + direct expenses = prime cost; factory overhead तथा opening/closing WIP adjustment = works cost; production administration overhead जोड़कर cost of production; finished goods adjustment के बाद cost of goods sold; selling/distribution overhead जोड़कर cost of sales। प्रश्न में दिया format follow करें। Material consumed में opening raw material, purchases और inward cost जोड़कर returns तथा closing stock घटाते हैं।',
    },
    example: {
      english: 'Direct material consumed ₹50,000, direct labour ₹20,000 and direct expenses ₹5,000 give prime cost ₹75,000. Factory overhead ₹15,000, opening WIP ₹4,000 and closing WIP ₹3,000 give works cost ₹91,000. Add production administration overhead ₹9,000: cost of production ₹1,00,000. If opening finished goods are ₹8,000 and closing finished goods ₹10,000, cost of goods sold is ₹98,000. Add selling/distribution overhead ₹7,000: cost of sales ₹1,05,000.',
      hinglish: 'Direct material ₹50,000 + labour ₹20,000 + direct expenses ₹5,000 = prime cost ₹75,000. Factory OH ₹15,000 + opening WIP ₹4,000 − closing WIP ₹3,000 = works cost ₹91,000. Production admin ₹9,000 add = production cost ₹1,00,000. Opening FG ₹8,000 add, closing FG ₹10,000 less = COGS ₹98,000. Selling OH ₹7,000 add = cost of sales ₹1,05,000.',
      hindi: 'Direct material ₹50,000 + labour ₹20,000 + direct expenses ₹5,000 = prime cost ₹75,000। Factory OH ₹15,000, opening WIP ₹4,000 और closing WIP ₹3,000 से works cost ₹91,000। Production administration ₹9,000 जोड़ने पर production cost ₹1,00,000। Opening finished goods ₹8,000 जोड़ें, closing ₹10,000 घटाएँ: COGS ₹98,000। Selling overhead ₹7,000 जोड़कर cost of sales ₹1,05,000।',
    },
    simpler: {
      english: 'A cost sheet builds total cost step by step: direct costs → factory cost → production cost → goods sold → sales cost. Add opening stock/WIP and subtract closing stock/WIP at the right stage.',
      hinglish: 'Cost sheet step-by-step total cost banata hai: direct cost → factory cost → production cost → goods sold → sales cost. Opening stock/WIP add aur closing stock/WIP correct stage par less karo.',
      hindi: 'Cost sheet total cost को क्रम से बनाता है: direct cost → factory cost → production cost → goods sold → sales cost। Opening stock/WIP जोड़ें और closing stock/WIP सही stage पर घटाएँ।',
    },
    quiz: {
      english: 'A student adds selling overhead before calculating cost of production and subtracts closing WIP from prime cost. Identify both sequencing errors and state the correct stages.',
      hinglish: 'Student selling overhead ko cost of production se pehle add karta hai aur closing WIP ko prime cost se less karta hai. Dono errors identify karke correct stage batao.',
      hindi: 'एक student selling overhead को cost of production से पहले जोड़ता है और closing WIP को prime cost से घटाता है। दोनों errors identify करके सही stage बताएँ।',
    },
  },
  {
    chapterNumber: 7,
    title: 'Cost Accounting Systems',
    aliases: ['cost accounting systems', 'job costing versus process costing', 'batch costing system', 'contract costing system', 'operation costing', 'integrated accounts', 'non integrated accounts', 'cost ledger', 'लागत लेखांकन प्रणाली'],
    answer: {
      english: 'A cost accounting system is designed around the nature of production, information needs and control structure. Job costing accumulates costs for identifiable jobs or orders; batch costing treats a group of identical units as a cost object; process costing accumulates costs by process or department for continuous or repetitive production; service costing measures the cost of a service unit; contract costing is used for large, long-duration site-specific contracts. A system may be integrated with financial accounts or maintained separately with reconciliation. Integrated accounting uses one set of books for both financial and cost records; non-integrated accounting maintains separate books and requires reconciliation of profit differences. Select the system based on output characteristics rather than habit. The design must define cost centres, cost units, coding, source documents, allocation bases, inventory treatment, reporting frequency and responsibility for variances.',
      hinglish: 'Cost accounting system production nature aur info needs ke basis par select hota hai. Job costing specific job/order ki cost; batch costing group of identical units; process costing continuous/repetitive process; service costing service unit; contract costing large long-duration site contract. Accounts integrated ho sakte hain—same books mein financial + cost records—or non-integrated—separate books with reconciliation. System output nature ke basis par choose karo. Cost centre, cost unit, coding, documents, allocation base, inventory treatment aur reporting responsibility define honi chahiye.',
      hindi: 'Cost accounting system production की nature और information needs के अनुसार चुना जाता है। Job costing में specific job/order की लागत, batch costing में identical units के group की लागत, process costing में continuous/repetitive process की लागत, service costing में service unit की लागत और contract costing में बड़े long-duration contract की लागत जमा होती है। Integrated accounting में financial और cost records एक ही books में होते हैं; non-integrated में अलग books और reconciliation आवश्यक है। System output की nature के अनुसार चुनें और cost centres, cost units, documents तथा allocation bases स्पष्ट रखें।',
    },
    example: {
      english: 'A furniture maker produces customer-specific designs: job costing is appropriate. A bakery makes batches of 500 identical loaves: batch costing may be suitable. A chemical plant producing continuously through mixing and refining stages may use process costing.',
      hinglish: 'Custom furniture maker ke liye job costing; 500 identical bread loaves ke batch ke liye batch costing; continuous chemical production stages ke liye process costing suitable ho sakta hai.',
      hindi: 'Custom furniture maker के लिए job costing, 500 identical bread loaves के batch के लिए batch costing और continuous chemical production के लिए process costing उपयुक्त हो सकता है।',
    },
    simpler: {
      english: 'Choose the costing system by asking: is output a unique job, a batch, a continuous process, a service or a long-term contract?',
      hinglish: 'System choose karne ke liye poochho: output unique job hai, batch hai, continuous process hai, service hai ya long-term contract?',
      hindi: 'Costing system चुनते समय पूछें: output unique job, batch, continuous process, service या long-term contract है?',
    },
    quiz: {
      english: 'A company manufactures standard pumps in continuous stages but receives separate customer orders for different quantities. Explain which costing system is most suitable and whether order-wise reporting can still be produced.',
      hinglish: 'Company standard pumps continuous stages mein banati hai, par customer orders different quantities ke hain. Suitable costing system kya hoga aur order-wise report possible hai?',
      hindi: 'एक company standard pumps continuous stages में बनाती है, लेकिन customer orders अलग-अलग quantities के हैं। कौन-सा costing system उपयुक्त होगा और क्या order-wise reporting संभव है?',
    },
  },
  {
    chapterNumber: 8,
    title: 'Unit & Batch Costing',
    aliases: ['unit costing', 'batch costing', 'economic batch quantity', 'ebq', 'batch size', 'cost per unit', 'इकाई लागत', 'बैच लागत'],
    answer: {
      english: 'Unit costing is appropriate where a homogeneous product is produced continuously or in large quantities; total cost for the period is divided by equivalent units of output after adjusting for work-in-progress where necessary. Batch costing is used when identical units are produced in identifiable batches. A batch is treated as a cost unit and batch cost is divided by good units produced, with normal loss treatment where applicable. Economic Batch Quantity balances batch setup cost against inventory carrying cost. A common basic formula is EBQ = √(2DS/H), where D is annual demand, S is setup cost per batch and H is annual carrying cost per unit; verify the notation used in the question. Smaller batches increase setup frequency; larger batches increase average inventory. Batch cost may include materials, labour, setup and production overhead. Clearly distinguish batch size, units started, good units and normal/abnormal loss.',
      hinglish: 'Unit costing homogeneous product ki high-volume production mein use hota hai; period cost ko equivalent output se divide karte hain, WIP adjust karke. Batch costing mein identical units ka group ek cost unit hota hai. Batch cost ÷ good units se per-unit cost aati hai, normal loss treatment ke baad. EBQ setup cost aur inventory carrying cost balance karta hai: √(2DS/H), jahan D annual demand, S setup cost per batch aur H annual carrying cost per unit. Small batches setup frequency badhate hain; large batches average inventory. Batch size, started units, good units aur normal/abnormal loss separate rakho.',
      hindi: 'Unit costing homogeneous product की large-scale production में उपयोग होता है; WIP adjust करके period cost को equivalent output से divide करते हैं। Batch costing में identical units का समूह cost unit होता है। Batch cost को good units से divide करके per-unit cost निकाली जाती है, normal loss treatment सहित। EBQ setup cost और carrying cost को balance करता है: √(2DS/H), जहाँ D annual demand, S setup cost per batch और H annual carrying cost per unit है। Batch size, units started, good units और normal/abnormal loss अलग रखें।',
    },
    example: {
      english: 'A batch costs ₹48,000 and produces 960 good units after normal loss. Cost per good unit = ₹48,000 ÷ 960 = ₹50. Do not divide by units started if the question asks for cost per good unit.',
      hinglish: 'Batch total cost ₹48,000 hai aur normal loss ke baad 960 good units mile. Cost per good unit = ₹48,000/960 = ₹50. Good unit ke liye started units se divide mat karna.',
      hindi: 'Batch cost ₹48,000 है और normal loss के बाद 960 good units हैं। प्रति good unit cost = ₹48,000 ÷ 960 = ₹50।',
    },
    simpler: {
      english: 'Unit costing measures one uniform output. Batch costing measures a group of identical units together, then spreads batch cost over good units.',
      hinglish: 'Unit costing ek uniform unit ki cost nikalta hai. Batch costing identical units ke group ki total cost nikal kar good units mein divide karta hai.',
      hindi: 'Unit costing एक समान output की cost निकालता है। Batch costing identical units के group की cost निकालकर good units में बाँटता है।',
    },
    quiz: {
      english: 'A batch has 1,000 units started, 40 normal loss units and 10 abnormal loss units. State the correct denominator for cost per good unit and explain why abnormal loss should be shown separately.',
      hinglish: 'Batch mein 1,000 units started, 40 normal loss aur 10 abnormal loss hain. Cost per good unit ka denominator kya hoga? Abnormal loss alag kyun show hoga?',
      hindi: 'Batch में 1,000 units शुरू किए गए, 40 normal loss और 10 abnormal loss हैं। Cost per good unit का denominator क्या होगा और abnormal loss अलग क्यों दिखेगा?',
    },
  },
  {
    chapterNumber: 9,
    title: 'Job Costing',
    aliases: ['job costing', 'job cost card', 'job order costing', 'job cost sheet', 'job work', 'काम आदेश लागत'],
    answer: {
      english: 'Job costing accumulates costs for a separately identifiable job, order or contract, often with different specifications. Each job receives a unique reference and cost record. Direct material and direct labour are traced to the job; direct expenses are charged where identifiable; overheads are absorbed using an appropriate predetermined rate. The job cost card records quantities, rates, hours and applied overhead. Where a job is incomplete at period end, its accumulated cost normally remains work-in-progress subject to the applicable valuation rules. When completed, it transfers to finished goods or cost of sales depending on delivery and policy. Quoted price should consider full cost, required margin, capacity, competitive conditions and strategic purpose; do not assume markup on cost equals margin on selling price.',
      hinglish: 'Job costing separate identifiable job/order ki cost accumulate karta hai, jahan specifications different ho sakti hain. Har job ko unique reference aur cost card milta hai. Direct material/labour trace karo, direct expenses charge karo aur overhead suitable predetermined rate se absorb karo. Cost card quantity, rate, hours aur overhead record karta hai. Incomplete job ka cost WIP rehta hai; completion par finished goods ya sales mein transfer hota hai. Quotation full cost, margin, capacity, competition aur strategy dekhkar banao. Mark-up aur margin same nahi hote.',
      hindi: 'Job costing में अलग पहचाने जा सकने वाले job/order की लागत जमा की जाती है। प्रत्येक job का unique reference और cost card होता है। Direct material तथा labour trace किए जाते हैं; direct expenses charge होते हैं और overhead suitable predetermined rate से absorb होता है। Incomplete job का accumulated cost WIP रहता है; completion पर policy के अनुसार finished goods या cost of sales में transfer होता है। Quotation बनाते समय full cost, margin, capacity और competition देखें।',
    },
    example: {
      english: 'Job 105 uses materials ₹12,000, labour ₹8,000 and direct expense ₹1,000. Overhead is absorbed at 75% of direct labour cost = ₹6,000. Total job cost = ₹27,000. If the target markup on cost is 20%, quoted price before any taxes or specific adjustments = ₹32,400.',
      hinglish: 'Job 105: material ₹12,000 + labour ₹8,000 + direct expense ₹1,000. OH 75% of labour = ₹6,000. Total cost ₹27,000. 20% mark-up par price ₹32,400 (tax/other adjustments se pehle).',
      hindi: 'Job 105 में material ₹12,000, labour ₹8,000, direct expense ₹1,000 और overhead (labour का 75%) ₹6,000 है। Total job cost ₹27,000। 20% mark-up पर price ₹32,400 होगा।',
    },
    simpler: {
      english: 'Give every customised job its own cost record. Trace direct costs to it and apply a fair share of overhead.',
      hinglish: 'Har customised job ka separate cost card rakho. Direct cost usi job ko trace karo aur overhead suitable rate se add karo.',
      hindi: 'हर customised job का अलग cost card रखें। Direct costs उसी job को charge करें और overhead उचित rate से जोड़ें।',
    },
    quiz: {
      english: 'A job remains unfinished at the reporting date and has absorbed overhead based on a predetermined rate. Explain where its cost is held and why actual-period overhead variance should not automatically be loaded entirely onto that one job.',
      hinglish: 'Job reporting date par incomplete hai aur predetermined rate se OH absorb hua hai. Cost kahan hold hogi aur actual overhead variance ko poora isi job par kyun nahi daalna chahiye?',
      hindi: 'एक job reporting date पर incomplete है और उस पर predetermined rate से overhead absorb हुआ है। इसकी cost कहाँ रहेगी और actual overhead variance पूरा उसी job पर क्यों नहीं डालना चाहिए?',
    },
  },
  {
    chapterNumber: 10,
    title: 'Process & Operation Costing',
    aliases: ['process costing', 'operation costing', 'equivalent production', 'equivalent units', 'normal loss', 'abnormal loss', 'abnormal gain', 'process account', 'fifo process costing', 'weighted average process', 'प्रक्रिया लागत', 'समतुल्य उत्पादन'],
    answer: {
      english: 'Process costing is used for continuous or repetitive production where output passes through identifiable processes or departments. Each process account accumulates material, labour and production overhead. Cost per unit is determined after considering normal loss, abnormal loss/gain and work-in-progress. Where units are incomplete, equivalent production expresses incomplete work as an equivalent number of fully completed units. Under FIFO, opening WIP work is separated from current-period work; under weighted average, opening WIP cost and current costs are blended. Use the method specified and do not mix their equivalent-unit logic. Normal loss is expected under efficient conditions and its scrap value, if any, is credited as applicable. Abnormal loss/gain is separately identified because it is not part of normal production cost. Operation costing combines features of job and process costing where standardised operations are performed but products or orders may differ in combinations.',
      hinglish: 'Process costing continuous/repetitive production mein use hota hai jahan output processes/departments se guzarta hai. Har process account material, labour aur OH collect karta hai. Unit cost nikalte waqt normal loss, abnormal loss/gain aur WIP consider karo. Incomplete units ko equivalent production mein completed-unit equivalent banate hain. FIFO opening WIP ka prior work separate rakhta hai; weighted average opening cost aur current cost blend karta hai. Jo method question de, wahi follow karo. Abnormal loss/gain separately identify hota hai. Operation costing job aur process costing ke features combine karta hai.',
      hindi: 'Process costing continuous/repetitive production में उपयोग होता है जहाँ output अलग-अलग processes या departments से गुजरता है। प्रत्येक process account material, labour और overhead जमा करता है। Unit cost में normal loss, abnormal loss/gain और WIP का ध्यान रखा जाता है। Incomplete units को equivalent production में पूर्ण units के equivalent में व्यक्त करते हैं। FIFO में opening WIP का prior work अलग रहता है; weighted average में opening और current costs blend होते हैं। प्रश्न में दिया method अपनाएँ। Abnormal loss/gain अलग identify करें।',
    },
    example: {
      english: 'A process has 1,000 units introduced, normal loss 5%, and actual output 930 units. Normal output is 950; actual output is 20 units below normal, so abnormal loss is 20 units. The cost valuation still requires the question’s scrap value and cost per expected good unit.',
      hinglish: '1,000 units introduced; normal loss 5% = 50 units; expected output 950. Actual output 930, so abnormal loss = 20 units. Value nikalne ke liye scrap value aur expected good-unit cost bhi chahiye.',
      hindi: '1,000 units input, normal loss 5% यानी 50 units; expected output 950। Actual output 930 है, इसलिए abnormal loss 20 units है। Valuation के लिए scrap value और expected good-unit cost भी चाहिए।',
    },
    simpler: {
      english: 'Process costing follows products through stages. Equivalent units convert partly finished work into a comparable amount of completed output.',
      hinglish: 'Process costing product ko stages mein follow karta hai. Equivalent units incomplete WIP ko completed-output ke equivalent mein convert karte hain.',
      hindi: 'Process costing product को अलग-अलग stages में track करता है। Equivalent units incomplete WIP को completed output के equivalent में बदलते हैं।',
    },
    quiz: {
      english: 'Opening WIP is 100 units 60% complete and closing WIP is 200 units 40% complete. Explain why equivalent units differ under FIFO and weighted average even if physical units are identical.',
      hinglish: 'Opening WIP 100 units 60% complete, closing WIP 200 units 40% complete. Physical units same hone ke bawajood FIFO aur weighted average equivalent units different kyun de sakte hain?',
      hindi: 'Opening WIP 100 units 60% complete और closing WIP 200 units 40% complete है। Physical units समान होने पर भी FIFO और weighted average equivalent units अलग क्यों दे सकते हैं?',
    },
  },
  {
    chapterNumber: 11,
    title: 'Joint Products and By Products',
    aliases: ['joint products', 'by products', 'joint cost apportionment', 'split off point', 'further processing', 'sales value at split off', 'net realisable value method', 'संयुक्त उत्पाद', 'उप उत्पाद'],
    answer: {
      english: 'Joint products arise simultaneously from a common process and have significant sale value; by-products are incidental outputs with relatively lower value. Joint costs are incurred before the split-off point and cannot be traced separately to each joint product at that stage. They may be apportioned using physical units, sales value at split-off or net realisable value where appropriate. The chosen basis affects reported product cost but not the total joint cost. For a further-processing decision, compare incremental revenue from processing after split-off with incremental processing cost; joint cost is sunk for that decision and should not drive the choice. By-product proceeds may be credited against process cost or treated using the specified method. Separate joint-cost allocation (for inventory/profit reporting) from relevant-cost analysis (for decisions).',
      hinglish: 'Joint products common process se simultaneously nikalte hain aur significant sale value rakhte hain; by-product incidental aur relatively low value output hai. Split-off se pehle joint cost hoti hai, jo alag trace nahi hoti. Apportionment physical units, split-off sales value ya NRV basis se ho sakta hai. Basis reported cost change karta hai, total joint cost nahi. Further processing decision mein incremental revenue compare karo incremental processing cost se; joint cost sunk hai, decision mein relevant nahi. Reporting allocation aur decision-making relevant costing ko mix mat karo.',
      hindi: 'Joint products एक common process से साथ-साथ निकलते हैं और उनकी significant sales value होती है; by-products incidental और अपेक्षाकृत कम value वाले outputs हैं। Split-off point से पहले joint cost अलग trace नहीं की जा सकती। इसे physical units, split-off sales value या NRV basis से apportion किया जा सकता है। Further-processing decision में incremental revenue की तुलना incremental processing cost से करें; joint cost पहले ही incur हो चुकी sunk cost है।',
    },
    example: {
      english: 'After split-off, Product A can be sold for ₹80,000 or processed further for ₹12,000 to sell for ₹98,000. Incremental revenue is ₹18,000 and incremental cost is ₹12,000; further processing adds ₹6,000 contribution before considering any other incremental effects. Do not allocate joint cost again in this decision.',
      hinglish: 'Product A split-off par ₹80,000 mein bikta hai. Further processing cost ₹12,000 aur final sales ₹98,000 hai. Incremental revenue ₹18,000, incremental cost ₹12,000; extra ₹6,000 benefit. Joint cost ko decision mein dobara include mat karo.',
      hindi: 'Product A split-off पर ₹80,000 में बिक सकता है। Further processing cost ₹12,000 और final sales ₹98,000 हैं। Incremental revenue ₹18,000 और incremental cost ₹12,000 है; अतिरिक्त लाभ ₹6,000 है।',
    },
    simpler: {
      english: 'Joint products share an earlier production cost. For deciding whether to process one product further, compare only extra revenue with extra cost after split-off.',
      hinglish: 'Joint products ka pehle ka cost common hota hai. Further process karna hai ya nahi—split-off ke baad ka extra revenue aur extra cost compare karo.',
      hindi: 'Joint products की शुरुआती लागत common होती है। आगे process करना है या नहीं, यह तय करने के लिए split-off के बाद की अतिरिक्त revenue और cost compare करें।',
    },
    quiz: {
      english: 'Two joint products have been produced and joint cost has already been incurred. One product can be sold now or processed further. Explain why apportioned joint cost is not relevant to the further-processing decision.',
      hinglish: 'Do joint products ban chuke hain aur joint cost incur ho gayi. Ek product abhi sell ho sakta hai ya further process. Apportioned joint cost decision ke liye relevant kyun nahi?',
      hindi: 'दो joint products बन चुके हैं और joint cost incur हो चुकी है। एक product अभी बेचा जा सकता है या further process किया जा सकता है। Apportioned joint cost इस decision के लिए relevant क्यों नहीं है?',
    },
  },
  {
    chapterNumber: 12,
    title: 'Service Costing',
    aliases: ['service costing', 'operating costing', 'passenger kilometre', 'tonne kilometre', 'bed occupancy', 'service cost unit', 'transport costing', 'सेवा लागत', 'परिचालन लागत'],
    answer: {
      english: 'Service or operating costing measures the cost of providing a service, often using composite cost units that combine quantity and distance/time. Examples include passenger-kilometre, tonne-kilometre, bed-day, room-day and meal served. A simple cost per service unit is total relevant operating cost divided by service units delivered, but the chosen denominator must match the cost driver and capacity use. For transport, distinguish absolute tonne-kilometres (weight × distance for each consignment) from commercial tonne-kilometres where the specified basis includes revenue or capacity considerations. Fixed and variable costs may be analysed separately, and empty running, idle capacity and abnormal service interruptions should not be hidden. Service costing supports tariff/pricing, route and capacity decisions, but cost per unit does not automatically equal a market price.',
      hinglish: 'Service costing service provide karne ki cost measure karta hai. Composite units use hote hain—passenger-km, tonne-km, bed-day, room-day, meal served. Cost per unit = relevant operating cost ÷ service units; denominator cost driver/capacity use se match hona chahiye. Transport mein absolute tonne-km (weight × distance) aur commercial tonne-km ka difference question ke basis se samjho. Fixed/variable costs, empty running, idle capacity aur abnormal interruption ko separately analyse karo. Cost per unit automatically selling price nahi hota.',
      hindi: 'Service costing service प्रदान करने की लागत मापता है। इसमें composite cost units जैसे passenger-kilometre, tonne-kilometre, bed-day, room-day और meal served उपयोग होते हैं। Cost per unit = relevant operating cost ÷ service units, लेकिन denominator वास्तविक cost driver और capacity use से मेल खाना चाहिए। Transport में absolute tonne-km तथा commercial tonne-km का अंतर प्रश्न के आधार से समझें। Fixed/variable cost, empty running और idle capacity अलग analyse करें। Cost per unit अपने-आप market price नहीं होता।',
    },
    example: {
      english: 'A bus incurs relevant annual operating cost of ₹24,00,000 and delivers 1,20,000 passenger-km. Cost per passenger-km = ₹20. A ticket price also depends on occupancy, route, taxes, competition and desired margin.',
      hinglish: 'Bus ka annual operating cost ₹24,00,000 aur output 1,20,000 passenger-km hai. Cost/passenger-km = ₹20. Ticket price ke liye occupancy, route, taxes, competition aur margin bhi dekho.',
      hindi: 'Bus का annual operating cost ₹24,00,000 और output 1,20,000 passenger-km है। Cost प्रति passenger-km ₹20 है। Ticket price तय करते समय occupancy, route और competition भी देखें।',
    },
    simpler: {
      english: 'Service costing divides service costs by a sensible unit of service delivered—such as one passenger carried for one kilometre.',
      hinglish: 'Service costing mein total service cost ko sensible service unit se divide karte hain—jaise ek passenger ko ek kilometre le jaana.',
      hindi: 'Service costing में total cost को service की उपयुक्त इकाई से divide करते हैं, जैसे एक passenger को एक kilometre ले जाना।',
    },
    quiz: {
      english: 'A transport company has many empty return trips. Explain how ignoring empty running could distort cost per passenger-kilometre and route pricing.',
      hinglish: 'Transport company ke return trips empty hain. Empty running ignore karne se cost/passenger-km aur route pricing distort kaise hogi?',
      hindi: 'एक transport company की कई return trips खाली हैं। Empty running ignore करने से cost per passenger-kilometre और route pricing कैसे distort होगी?',
    },
  },
  {
    chapterNumber: 13,
    title: 'Standard Costing',
    aliases: ['standard costing', 'material cost variance', 'labour variance', 'overhead variance', 'sales variance', 'variance analysis', 'standard quantity', 'standard hours', 'मानक लागत', 'विचरण विश्लेषण'],
    answer: {
      english: 'Standard costing sets predetermined cost standards for defined conditions and compares actual performance with those standards. Variance analysis identifies differences and helps investigate causes; a variance is a signal, not a verdict on an employee. Material cost variance = standard cost of actual output − actual material cost, commonly analysed into price and usage variances. Labour cost variance is analysed into rate and efficiency variances. Fixed and variable overhead variances use separate spending, volume, capacity and efficiency concepts depending on the question’s model. Use standard quantity/hours allowed for actual output, not budgeted output, when calculating operational variances. Favourable/unfavourable labels describe the effect on cost or profit, but managers should examine quality, waste, overtime, supplier reliability and behavioural effects. Standards need periodic review when technology, prices, methods or product specifications change.',
      hinglish: 'Standard costing defined conditions ke liye predetermined standard set karta hai aur actual result se compare karta hai. Variance analysis difference aur possible cause dikhata hai; variance signal hai, employee par verdict nahi. Material cost variance ko price aur usage variance mein; labour cost variance ko rate aur efficiency mein analyse karte hain. Actual output ke liye standard quantity/hours allowed use karo, budget output nahi. Favourable/unfavourable cost/profit impact batata hai, par quality, waste, overtime, supplier aur behaviour bhi investigate karo. Standards conditions change hone par update karo.',
      hindi: 'Standard costing defined conditions के लिए predetermined standards बनाता है और actual performance से तुलना करता है। Variance analysis differences तथा उनके कारणों की जाँच में मदद करता है; variance केवल signal है। Material cost variance को price और usage variance में तथा labour cost variance को rate और efficiency variance में analyse किया जाता है। Actual output के लिए allowed standard quantity/hours उपयोग करें, budget output नहीं। Favourable/unfavourable का अर्थ cost/profit effect है; quality, waste, overtime और supplier factors भी जाँचें।',
    },
    example: {
      english: 'Standard material for actual output is 500 kg at ₹10/kg; actual usage is 520 kg at ₹11/kg. Standard cost = ₹5,000; actual cost = ₹5,720; total material cost variance = ₹720 adverse. Price variance = 520 × (10 − 11) = ₹520 adverse. Usage variance = 10 × (500 − 520) = ₹200 adverse.',
      hinglish: 'Actual output ka standard 500 kg @₹10; actual 520 kg @₹11. Standard ₹5,000, actual ₹5,720, total ₹720 A. Price variance 520×(10−11)=₹520 A; usage variance 10×(500−520)=₹200 A.',
      hindi: 'Actual output के लिए standard 500 kg @₹10 और actual 520 kg @₹11 है। Standard cost ₹5,000, actual ₹5,720, total variance ₹720 adverse। Price variance ₹520 adverse और usage variance ₹200 adverse है।',
    },
    simpler: {
      english: 'A standard is the expected cost for actual output. Variance tells you how much actual cost differs and helps separate price, usage, rate or efficiency reasons.',
      hinglish: 'Standard actual output ke liye expected cost hai. Variance batata hai actual cost kitni different hai aur price/usage/rate/efficiency ka reason alag karta hai.',
      hindi: 'Standard actual output की expected cost है। Variance बताता है actual cost कितनी अलग है और price, usage, rate या efficiency का कारण समझने में मदद करता है।',
    },
    quiz: {
      english: 'Actual material price is lower than standard but material usage is much higher and quality defects increase. Explain why a favourable price variance may coexist with an adverse overall outcome.',
      hinglish: 'Actual material price standard se kam hai lekin usage zyada aur defects bhi badh gaye. Favourable price variance ke saath overall result adverse kyun ho sakta hai?',
      hindi: 'Actual material price standard से कम है, लेकिन usage अधिक और defects भी बढ़ गए। Favourable price variance के साथ overall result adverse क्यों हो सकता है?',
    },
  },
  {
    chapterNumber: 14,
    title: 'Marginal Costing',
    aliases: ['marginal costing', 'contribution', 'p v ratio', 'p/v ratio', 'break even point', 'bep', 'margin of safety', 'key factor', 'make or buy marginal costing', 'सीमांत लागत', 'योगदान'],
    answer: {
      english: 'Marginal costing separates variable costs from fixed costs for decision analysis. Contribution = sales − variable cost; profit = contribution − fixed cost. P/V ratio = contribution ÷ sales × 100. Break-even point in units = fixed cost ÷ contribution per unit; break-even sales = fixed cost ÷ P/V ratio. Margin of safety = actual or budgeted sales − break-even sales. At a constant sales mix, multi-product break-even analysis requires a weighted contribution basis. Marginal costing is useful for short-term decisions such as special orders, make-or-buy, product mix and shutdown, but relevant costs must be identified carefully. Fixed costs may be avoidable or unavoidable; a fixed cost is not automatically irrelevant if a decision changes it. Capacity constraints, opportunity cost, qualitative factors and long-term pricing effects should also be considered. Do not use a short-run marginal price as a sustainable long-run price without covering capacity and fixed costs.',
      hinglish: 'Marginal costing variable aur fixed cost separate karta hai. Contribution = sales − variable cost; profit = contribution − fixed cost. P/V ratio = contribution/sales ×100. BEP units = fixed cost/contribution per unit; BEP sales = fixed cost/PV ratio. Margin of safety = actual/budget sales − BE sales. Constant sales mix mein weighted contribution use karo. Special order, make-or-buy, product mix, shutdown jaise short-term decisions mein useful hai. Fixed cost avoidable ho sakti hai ya unavoidable—automatic irrelevant nahi. Capacity, opportunity cost, qualitative factors aur long-term pricing effects bhi check karo.',
      hindi: 'Marginal costing variable तथा fixed cost को अलग करता है। Contribution = sales − variable cost; profit = contribution − fixed cost। P/V ratio = contribution ÷ sales × 100। BEP units = fixed cost ÷ contribution per unit; BE sales = fixed cost ÷ P/V ratio। Margin of safety = actual/budgeted sales − break-even sales। Special order, make-or-buy, product mix और shutdown decisions में उपयोगी है। Fixed cost avoidable या unavoidable हो सकती है; निर्णय से बदलने वाली fixed cost relevant हो सकती है। Capacity, opportunity cost और qualitative factors भी देखें।',
    },
    example: {
      english: 'Selling price ₹100, variable cost ₹60, fixed cost ₹2,00,000. Contribution/unit ₹40; P/V ratio 40%; break-even units = 2,00,000/40 = 5,000 units; break-even sales = ₹5,00,000. At sales of 6,000 units, margin of safety is 1,000 units or ₹1,00,000.',
      hinglish: 'SP ₹100, VC ₹60, fixed ₹2,00,000. Contribution ₹40/unit, PV 40%, BEP 5,000 units, BE sales ₹5,00,000. Sales 6,000 units par MOS 1,000 units ya ₹1,00,000.',
      hindi: 'Selling price ₹100, variable cost ₹60 और fixed cost ₹2,00,000 है। Contribution ₹40/unit, P/V ratio 40%, BEP 5,000 units और BE sales ₹5,00,000। 6,000 units sales पर margin of safety 1,000 units है।',
    },
    simpler: {
      english: 'Each unit first contributes towards fixed costs. After fixed costs are covered, the remaining contribution becomes profit.',
      hinglish: 'Har unit pehle fixed cost cover karne mein contribution deta hai. Fixed cost cover ho jaaye toh extra contribution profit ban jaata hai.',
      hindi: 'हर unit पहले fixed cost cover करने में योगदान देता है। Fixed cost cover होने के बाद बचा contribution profit बनता है।',
    },
    quiz: {
      english: 'A special order price is below normal selling price but above variable cost. Under what conditions could accepting it increase profit, and which capacity or displacement risks must be checked?',
      hinglish: 'Special order price normal price se kam but variable cost se zyada hai. Kin conditions mein accept karne se profit badhega? Kaunse risks check karne chahiye?',
      hindi: 'Special order price normal selling price से कम लेकिन variable cost से अधिक है। किन conditions में इसे स्वीकार करने से profit बढ़ सकता है और कौन-से risks जाँचने चाहिए?',
    },
  },
  {
    chapterNumber: 15,
    title: 'Budgets and Budgetary Control',
    aliases: ['budgets and budgetary control', 'budgetary control', 'cash budget', 'flexible budget', 'fixed budget', 'production budget', 'sales budget', 'master budget', 'zero based budgeting', 'सम बजट नियंत्रण', 'बजट नियंत्रण'],
    answer: {
      english: 'A budget is a quantitative plan for a defined future period. Budgetary control compares actual results with budget, analyses variances and triggers corrective action. Budgets may be functional (sales, production, materials, labour, overhead, cash) and consolidated into a master budget. The principal budget factor or limiting factor—often sales demand, materials, labour or machine capacity—should be identified first because it governs the sequence of other budgets. A fixed budget is prepared for one activity level; a flexible budget adjusts expected costs/revenues for the actual activity level using appropriate behaviour patterns. A cash budget forecasts receipts and payments and is not the same as profit. Zero-based budgeting requires activities to be justified from a base of zero; incremental budgeting adjusts prior budgets. Budget participation can improve ownership but may encourage slack. Budgets are estimates and control tools, not guarantees; assumptions, responsibility, timing and external changes need review.',
      hinglish: 'Budget defined future period ka quantitative plan hai. Budgetary control actual results ko budget se compare karke variance analyse aur corrective action karta hai. Functional budgets—sales, production, material, labour, overhead, cash—master budget mein combine hote hain. Principal budget factor/limiting factor pehle identify karo, jaise sales demand, material, labour ya machine capacity. Fixed budget ek activity level ka; flexible budget actual activity ke according cost/revenue adjust karta hai. Cash budget receipts/payments forecast karta hai, profit nahi. Zero-based budgeting activities ko zero base se justify karata hai; incremental previous budget adjust karta hai. Participation ownership badhata hai par budgetary slack risk bhi ho sakta hai.',
      hindi: 'Budget एक defined future period की quantitative plan है। Budgetary control actual results को budget से compare करके variance analyse करता है और corrective action लेता है। Sales, production, material, labour, overhead तथा cash budgets को master budget में जोड़ा जाता है। Principal/limiting budget factor पहले identify करें, जैसे sales demand, material, labour या capacity। Fixed budget एक activity level पर होता है; flexible budget actual activity के अनुसार adjust होता है। Cash budget receipts/payments बताता है, profit नहीं। Zero-based budgeting में activities को zero base से justify किया जाता है; incremental budgeting पिछले budget में बदलाव करता है।',
    },
    example: {
      english: 'Variable cost is ₹12 per unit and fixed cost ₹1,20,000. At 10,000 units, flexible budget cost = ₹1,20,000 + (10,000 × ₹12) = ₹2,40,000. At 12,000 actual units, the comparable flexible budget is ₹2,64,000, not ₹2,40,000.',
      hinglish: 'Variable cost ₹12/unit aur fixed cost ₹1,20,000. 10,000 units par budget ₹2,40,000. Actual activity 12,000 units ho toh comparable flexible budget ₹2,64,000 hoga, old ₹2,40,000 nahi.',
      hindi: 'Variable cost ₹12 प्रति unit और fixed cost ₹1,20,000 है। 10,000 units पर budget ₹2,40,000 है। Actual activity 12,000 units हो तो comparable flexible budget ₹2,64,000 होगा।',
    },
    simpler: {
      english: 'A budget is the plan; budgetary control checks actual performance against a fair comparison and asks what action is needed. A flexible budget changes with activity; a cash budget tracks cash.',
      hinglish: 'Budget plan hai; budgetary control actual performance ko fair basis par compare karke action decide karta hai. Flexible budget activity ke saath change hota hai; cash budget cash receipts/payments track karta hai.',
      hindi: 'Budget plan है; budgetary control actual performance की उचित तुलना करके action तय करता है। Flexible budget activity के साथ बदलता है और cash budget cash receipts/payments track करता है।',
    },
    quiz: {
      english: 'A factory’s actual output is 20% above the original budget and actual total cost is 15% higher. Explain why this does not automatically indicate an adverse cost performance and what comparison is required.',
      hinglish: 'Factory ka actual output original budget se 20% zyada aur total cost 15% zyada hai. Ye automatically adverse kyun nahi? Kaunsi comparison chahiye?',
      hindi: 'Factory का actual output original budget से 20% अधिक और total cost 15% अधिक है। यह अपने-आप adverse performance क्यों नहीं है और कौन-सी comparison आवश्यक है?',
    },
  },
];

export const PARAKH_COST_BENCHMARKS = CHAPTERS.flatMap((chapter) => {
  const families = [
    ['core_concept', 'Explain the core concepts, terminology and cost flow in ' + chapter.title + '.'],
    ['unseen_numerical_application', 'Solve and explain a new numerical or operational scenario on ' + chapter.title + ', stating assumptions and workings.'],
    ['exam_style_presentation', 'Prepare a structured CA Intermediate exam-style response on ' + chapter.title + '.'],
    ['edge_case_and_common_error', 'Identify a difficult edge case or common mistake in ' + chapter.title + ' and explain how to avoid it.'],
    ['attempt_source_sensitivity', 'Verify chapter scope and any attempt-sensitive changes for ' + chapter.title + ' against the exact ICAI attempt edition.'],
  ] as const;
  return families.map(([family, question], index) => ({
    id: 'intermediate-cost-chapter-' + chapter.chapterNumber + '-' + (index + 1),
    chapterNumber: chapter.chapterNumber,
    family,
    question,
  }));
});

export type ParakhCostMatch = {
  topicId: string;
  topicTitle: string;
  course: 'CA_INTERMEDIATE';
  paperCode: 'INT-G2-P4';
  section: 'Cost and Management Accounting';
  chapterNumber: number;
  syllabusApplicability: string;
  contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED';
  benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED';
  mode: ParakhCostMode;
  answer: string;
  source: { title: string; url: string };
};

function normalize(value: string): string {
  return String(value || '').toLocaleLowerCase('en-IN')
    .normalize('NFKC')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function matchMode(message: string): ParakhCostMode {
  if (/\b(quiz|test me|ask me|practice question)\b|प्रश्नोत्तरी|टेस्ट लो|सवाल पूछो/i.test(message)) return 'quiz';
  if (/\b(example|illustrate|for example|case study)\b|उदाहरण|मिसाल/i.test(message)) return 'example';
  if (/\b(simple|simpler|easy language|in simple words)\b|आसान भाषा|सरल भाषा/i.test(message)) return 'simpler';
  return 'answer';
}

function isAttemptSensitive(message: string): boolean {
  return /\b(latest|most recent|amendment|amended|corrigendum|applicable for|upcoming attempt|my attempt|exact syllabus|new syllabus|may 2027|september 2027|january 2028)\b/i.test(message);
}

export function searchParakhCostAccountingKnowledge(input: {
  message: string;
  course: string;
  language: ParakhCostLanguage;
}): ParakhCostMatch | null {
  const message = String(input.message || '').trim();
  if (!message || input.course !== 'CA_INTERMEDIATE' || isAttemptSensitive(message)) return null;
  const normalized = ' ' + normalize(message) + ' ';
  const chapter = CHAPTERS.find((item) => item.aliases.some((alias) => {
    const needle = normalize(alias);
    return needle && normalized.includes(' ' + needle + ' ');
  }));
  if (!chapter) return null;
  const mode = matchMode(message);
  return {
    topicId: 'intermediate-cost-chapter-' + chapter.chapterNumber,
    topicTitle: chapter.title,
    course: 'CA_INTERMEDIATE',
    paperCode: 'INT-G2-P4',
    section: 'Cost and Management Accounting',
    chapterNumber: chapter.chapterNumber,
    syllabusApplicability: PARAKH_COST_APPLICABILITY,
    contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
    benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED',
    mode,
    answer: chapter[mode][input.language],
    source: {
      title: 'ICAI Intermediate Paper 4: Cost and Management Accounting — applicable for May 2027 exam onwards',
      url: PARAKH_COST_SOURCE_URL,
    },
  };
}

export function buildParakhCostAccountingReply(result: ParakhCostMatch, language: ParakhCostLanguage): string {
  const heading = language === 'hindi' ? 'अध्याय' : 'Chapter';
  const applicability = language === 'hinglish'
    ? '\n\n**Syllabus source:** ICAI ki official Paper 4 page May 2027 exam onwards ke liye ye chapter list karti hai. Different attempt ho toh exact material recheck karo.'
    : language === 'hindi'
      ? '\n\n**पाठ्यक्रम स्रोत:** ICAI की official Paper 4 page May 2027 exam onwards के लिए यह chapter list करती है। अलग attempt हो तो exact material दोबारा जाँचें।'
      : '\n\n**Syllabus source:** ICAI’s official Paper 4 page lists this chapter for May 2027 exams onwards. Recheck if your attempt differs.';
  const review = language === 'hinglish'
    ? '\n\n**Content status:** Original PARAKH author draft hai; qualified CA cost-accounting reviewer ne abhi verify nahi kiya. Figures/formula conventions ko exact ICAI material aur question ke data se cross-check karo.'
    : language === 'hindi'
      ? '\n\n**Content status:** यह original PARAKH author draft है; qualified CA cost-accounting reviewer ने अभी verify नहीं किया है। Figures और formula conventions को exact ICAI material तथा question के data से cross-check करें।'
      : '\n\n**Content status:** This is an original PARAKH author draft and has not yet been verified by a qualified CA cost-accounting reviewer. Cross-check figures and formula conventions against the exact ICAI material and question data.';
  return '**' + heading + ' ' + result.chapterNumber + ': ' + result.topicTitle + '**\n\n'
    + result.answer + applicability + review;
}

export function calculateCostSheetTotals(input: {
  directMaterialConsumed: number;
  directLabour: number;
  directExpenses: number;
  factoryOverheads: number;
  openingWorkInProgress?: number;
  closingWorkInProgress?: number;
  productionAdministrationOverheads?: number;
  openingFinishedGoods?: number;
  closingFinishedGoods?: number;
  sellingDistributionOverheads?: number;
}) {
  const values = Object.values(input);
  if (values.some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
    throw new Error('Cost sheet inputs must be finite, non-negative numbers.');
  }
  const primeCost = input.directMaterialConsumed + input.directLabour + input.directExpenses;
  const worksCost = primeCost + input.factoryOverheads
    + (input.openingWorkInProgress || 0) - (input.closingWorkInProgress || 0);
  const costOfProduction = worksCost + (input.productionAdministrationOverheads || 0);
  const costOfGoodsSold = costOfProduction
    + (input.openingFinishedGoods || 0) - (input.closingFinishedGoods || 0);
  const costOfSales = costOfGoodsSold + (input.sellingDistributionOverheads || 0);
  return { primeCost, worksCost, costOfProduction, costOfGoodsSold, costOfSales };
}

export function getParakhCostAccountingInventory() {
  return {
    course: 'CA_INTERMEDIATE' as const,
    paperCode: 'INT-G2-P4' as const,
    paperTitle: 'Cost and Management Accounting',
    sourceCheckedAt: '2026-11-08',
    sourceUrl: PARAKH_COST_SOURCE_URL,
    syllabusApplicability: PARAKH_COST_APPLICABILITY,
    chapterCount: CHAPTERS.length,
    authoredContentCount: CHAPTERS.length,
    humanReviewedContentCount: 0 as const,
    benchmarkCaseCount: PARAKH_COST_BENCHMARKS.length,
    humanReviewedBenchmarkCount: 0 as const,
    chapters: CHAPTERS.map((chapter) => ({
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      module: chapter.chapterNumber <= 7 ? 'Module 1' : 'Module 2',
      units: [] as string[],
      contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED' as const,
      benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' as const,
    })),
    limitations: [
      'Official ICAI catalogue is headed Applicable for May 2027 Exam Onwards; confirm exact attempt edition.',
      'Fifteen original chapter drafts exist in English, Hindi and Hinglish; none is human-reviewed.',
      'Seventy-five benchmark prompts are defined but have no approved answer keys and have not been evaluated.',
      'These are original notes and do not reproduce ICAI study material.',
    ],
  };
}
