export type ParakhSmLanguage = 'english' | 'hindi' | 'hinglish';
export type ParakhSmMode = 'answer' | 'example' | 'simpler' | 'quiz';

type Localised = Record<ParakhSmLanguage, string>;
type SmPack = {
  chapterNumber: number;
  title: string;
  keywords: string[];
  answer: Localised;
  example: Localised;
  simpler: Localised;
  quiz: Localised;
};

const SOURCE_URL = 'https://www.icai.org/post/sm-inter-p6b-may2027';
const SOURCE_INDEX_URL = 'https://www.icai.org/post/sm-intermediate-paper6b';
const SOURCE_APPLICABILITY = 'Official ICAI catalogue lists these five Section B chapters under the page headed Applicable for May 2027 Exam Onwards. Recheck the exact student attempt, study-material edition, RTP and any corrigendum before treating syllabus coverage as final.';

const PACKS: SmPack[] = [
  {
    chapterNumber: 1,
    title: 'Introduction to Strategic Management',
    keywords: [
      'strategic management', 'introduction to strategic management', 'meaning of strategy', 'strategic management meaning',
      'vision mission goals objectives values', 'strategic intent', 'levels of strategy',
      'corporate level business level functional level', 'strategic management process',
      'रणनीतिक प्रबंधन का परिचय', 'रणनीति का अर्थ', 'दृष्टि मिशन लक्ष्य',
    ],
    answer: {
      english: [
        'Strategic management is the continuing process of understanding an organisation’s direction, choosing how it will compete or serve its stakeholders, putting those choices into action and checking whether they are working. It connects long-term purpose with decisions about markets, customers, resources, capabilities and people.',
        'A strategy is not merely a target or a slogan. It is a coherent set of choices about where to play, how to create value and what the organisation will deliberately do differently. It normally combines planned initiatives with responses to unexpected changes.',
        'Strategic intent gives direction through related statements: vision describes the desired future; mission explains the organisation’s present purpose and whom it serves; goals express broad results; objectives translate those goals into specific, measurable outcomes; values guide behaviour and choices.',
        'Strategy operates at connected levels. Corporate-level strategy decides the overall portfolio and scope of businesses. Business-level strategy explains how a particular business will compete. Functional-level strategy translates the business direction into action in areas such as finance, marketing, operations and human resources.',
        'A practical process is: clarify purpose and objectives; analyse the external environment; assess internal resources and capabilities; generate and evaluate strategic alternatives; select a strategy; implement it through people, structure, budgets and systems; then monitor outcomes and revise when assumptions change.',
        'Why it matters: it helps allocate scarce resources, anticipate change, coordinate decisions and build a sustainable position. Limits also matter: forecasts can be wrong, analysis can consume time, rigid plans can slow response, and implementation can fail because of culture, capability or resistance. Strategy is a guide for informed action, not a guarantee of success.',
      ].join('\n\n'),
      hinglish: [
        'Strategic Management ek continuous process hai jisme organisation apni long-term direction samajhti hai, decide karti hai ki kis market/customer ko serve karna hai, value kaise create karni hai, strategy implement karti hai aur results check karti hai. Isme markets, resources, capabilities aur people sab connect hote hain.',
        'Strategy sirf target ya slogan nahi hoti. Ye clear choices ka set hai: organisation kahan compete karegi, kaise value degi aur competitors se alag kya karegi. Strategy mein planned actions ke saath unexpected changes par response bhi hota hai.',
        'Strategic intent ko samajhne ke liye: Vision desired future batata hai; Mission present purpose aur whom it serves batata hai; Goals broad results hain; Objectives specific aur measurable outcomes hain; Values decisions aur behaviour ko guide karte hain.',
        'Strategy ke 3 connected levels hain. Corporate level decide karta hai organisation kin businesses/markets mein rahegi. Business level batata hai ek business compete kaise karega. Functional level finance, marketing, operations aur HR jaise departments mein strategy ko action mein badalta hai.',
        'Process yaad rakh: purpose/objectives clear karo → external environment analyse karo → internal resources/capabilities assess karo → alternatives banao aur compare karo → strategy choose karo → people, structure, budget aur systems se implement karo → results monitor karke zarurat par revise karo.',
        'Importance: limited resources ko sahi jagah lagana, change anticipate karna aur departments ko same direction dena. Limits bhi hain: forecast galat ho sakta hai, analysis time le sakta hai, rigid plan response slow kar sakta hai aur culture/capability/resistance implementation fail kara sakte hain. Strategy success ki guarantee nahi, decision-making ka guide hai.',
      ].join('\n\n'),
      hindi: [
        'Strategic Management एक निरंतर प्रक्रिया है जिसमें organisation अपनी दीर्घकालीन दिशा समझती है, यह तय करती है कि किन markets और customers को serve करना है, value कैसे बनानी है, चुनी गई strategy लागू करती है और परिणामों की समीक्षा करती है। इसमें markets, resources, capabilities और people जुड़े रहते हैं।',
        'Strategy केवल target या slogan नहीं है। यह स्पष्ट choices का समूह है: organisation कहाँ compete करेगी, value कैसे देगी और अलग क्या करेगी। इसमें planned actions के साथ unexpected changes पर response भी शामिल होता है।',
        'Strategic intent के मुख्य हिस्से: Vision वांछित भविष्य बताता है; Mission वर्तमान purpose और organisation किसे serve करती है यह बताता है; Goals व्यापक परिणाम हैं; Objectives specific और measurable outcomes हैं; Values निर्णयों और व्यवहार को दिशा देते हैं।',
        'Strategy के तीन जुड़े स्तर हैं। Corporate level पूरे business portfolio और scope का निर्णय करता है। Business level किसी business के compete करने का तरीका तय करता है। Functional level finance, marketing, operations और HR जैसे क्षेत्रों में strategy को action में बदलता है।',
        'एक उपयोगी process है: purpose और objectives स्पष्ट करें; external environment analyse करें; internal resources और capabilities assess करें; alternatives बनाएँ और evaluate करें; strategy चुनें; people, structure, budgets और systems के माध्यम से implement करें; फिर outcomes monitor करके आवश्यक बदलाव करें।',
        'यह scarce resources के allocation, change की तैयारी और coordination में मदद करता है। इसकी सीमाएँ भी हैं: forecasts गलत हो सकते हैं, analysis समय ले सकता है, rigid plans response धीमा कर सकते हैं और culture, capability या resistance के कारण implementation विफल हो सकता है। Strategy सफलता की guarantee नहीं, informed action का guide है।',
      ].join('\n\n'),
    },
    example: {
      english: 'Example: a regional food company wants to become the preferred healthy-snack brand for working adults. Its vision may describe that desired position; its mission may focus on convenient, reliable nutrition. A goal could be stronger presence in urban markets. An objective could specify a target distribution reach and repeat-purchase rate by a stated date. Corporate strategy decides whether to enter adjacent food categories; business strategy chooses differentiation through trusted ingredients; functional plans set procurement, promotion and finance actions. Monthly review checks whether the assumptions and results still hold.',
      hinglish: 'Example: ek regional food company working adults ke liye preferred healthy-snack brand banna chahti hai. Vision desired position batayega; mission convenient aur reliable nutrition par focus karega. Goal urban market mein stronger presence ho sakta hai. Objective mein ek fixed date tak distribution reach aur repeat-purchase rate ka measurable target hoga. Corporate strategy decide karegi adjacent product categories mein enter karna hai ya nahi; business strategy trusted ingredients se differentiation choose karegi; functions procurement, promotion aur finance ke actions set karenge.',
      hindi: 'उदाहरण: एक regional food company working adults के लिए preferred healthy-snack brand बनना चाहती है। Vision वांछित स्थिति बताएगा; mission convenient और reliable nutrition पर focus करेगा। Goal urban markets में presence बढ़ाना हो सकता है। Objective में तय date तक distribution reach और repeat-purchase rate का measurable target होगा। Corporate strategy नए product categories में प्रवेश का निर्णय करेगी; business strategy trusted ingredients से differentiation चुनेगी; functional plans procurement, promotion और finance के actions तय करेंगे।',
    },
    simpler: {
      english: 'Think of strategy as a route, not just a destination. Vision is where you want to reach; mission is why you exist; objectives are measurable milestones; strategy is the route and trade-offs; implementation is taking the steps; evaluation checks whether the route still makes sense.',
      hinglish: 'Strategy ko destination nahi, route samajh. Vision batata hai kahan pahunchna hai; mission kyun exist karte ho; objectives measurable milestones hain; strategy route aur trade-offs decide karti hai; implementation steps uthana hai; evaluation check karta hai route abhi bhi sahi hai ya nahi.',
      hindi: 'Strategy को केवल destination नहीं, बल्कि वहाँ पहुँचने का route समझें। Vision बताता है कहाँ पहुँचना है; mission बताता है organisation क्यों मौजूद है; objectives measurable milestones हैं; strategy रास्ता और trade-offs चुनती है; implementation कदम उठाना है; evaluation जाँचता है कि रास्ता अभी भी सही है या नहीं।',
    },
    quiz: {
      english: 'A company has a statement “To become the most trusted low-cost provider in its region.” Classify whether it is more likely a vision, mission, goal or competitive strategy, and explain what additional measurable objective would make progress assessable.',
      hinglish: 'Ek company kehti hai: “apne region ka most trusted low-cost provider banna hai.” Ye vision, mission, goal ya competitive strategy mein se kya ho sakta hai? Ek measurable objective bhi likh jisse progress assess ho sake.',
      hindi: 'एक company कहती है: “अपने region का most trusted low-cost provider बनना है।” यह vision, mission, goal या competitive strategy में से क्या हो सकता है? एक measurable objective भी लिखें जिससे progress assess हो सके।',
    },
  },
  {
    chapterNumber: 2,
    title: 'Strategic Analysis: External Environment',
    keywords: [
      'strategic analysis external environment', 'external environment analysis', 'pestel', 'pestle',
      'micro environment macro environment', 'porter five forces', 'porters five forces', 'five forces model',
      'industry analysis', 'competitive forces', 'key success factors', 'business environment',
      'बाहरी वातावरण', 'पेस्टल', 'पाँच शक्तियाँ',
    ],
    answer: {
      english: [
        'External strategic analysis examines forces outside the organisation that can create opportunities or threats. Management cannot directly control these forces, but it can monitor them, understand their likely effect and choose how to respond.',
        'The macro environment affects many organisations. A PESTEL scan considers Political factors (public policy and political stability), Economic factors (inflation, interest rates, income and growth), Social factors (demographics, lifestyles and attitudes), Technological factors (innovation, automation and platforms), Environmental factors (climate, resource use and waste) and Legal factors (laws, regulation and compliance). PESTEL is a scanning checklist; it does not automatically tell the organisation which factor is most important.',
        'The micro or industry environment is closer to the organisation. It includes customers, suppliers, competitors, intermediaries, substitutes and new entrants. Porter’s Five Forces assesses industry attractiveness and pressure on returns through rivalry among existing competitors, threat of new entrants, threat of substitutes, bargaining power of buyers and bargaining power of suppliers.',
        'Do not treat the five forces as a score to calculate mechanically. Ask what drives each force, whether it is strengthening or weakening, and how it affects pricing, costs, customer loyalty and the ability to earn returns. A force may be strong in one segment and weak in another.',
        'Industry and market analysis can also examine market size and growth, customer needs, strategic groups, product life cycle, distribution routes and key success factors (KSFs). KSFs are the capabilities or conditions an organisation must perform well to compete in a particular industry; they differ by industry and can change over time.',
        'A useful output is a prioritised opportunity/threat list with evidence, time horizon, likelihood, impact and a response owner. Separate facts from assumptions, and revisit the scan when a major regulatory, technological or market change occurs.',
      ].join('\n\n'),
      hinglish: [
        'External strategic analysis organisation ke bahar ki forces study karta hai jo opportunity ya threat create kar sakti hain. Management in forces ko directly control nahi kar sakti, lekin monitor karke impact samajh aur response choose kar sakti hai.',
        'Macro environment kai organisations ko affect karta hai. PESTEL scan mein Political (government policy/stability), Economic (inflation, interest rate, income, growth), Social (demographics, lifestyle, attitudes), Technological (innovation, automation, platforms), Environmental (climate, resource use, waste) aur Legal (laws, regulation, compliance) factors check karte hain. PESTEL checklist hai; ye automatically priority decide nahi karta.',
        'Micro ya industry environment organisation ke closer hota hai: customers, suppliers, competitors, intermediaries, substitutes aur new entrants. Porter’s Five Forces industry competition aur returns par pressure ko samajhta hai: existing rivalry, new entrants ka threat, substitutes ka threat, buyers ki bargaining power aur suppliers ki bargaining power.',
        'Five Forces ko mechanical score mat bana. Har force ka driver kya hai, strong ho rahi hai ya weak, pricing/cost/customer loyalty/returns par kya effect hai—ye analyse kar. Ek segment mein force strong aur doosre mein weak ho sakti hai.',
        'Industry analysis mein market size/growth, customer needs, strategic groups, product life cycle, distribution channels aur Key Success Factors (KSFs) bhi aate hain. KSFs woh capabilities/conditions hain jinmein achha perform karna industry mein compete karne ke liye zaroori hai; ye industry aur time ke saath badal sakte hain.',
        'Final output ek prioritised opportunity/threat list honi chahiye—evidence, time horizon, likelihood, impact aur response owner ke saath. Facts aur assumptions alag rakho aur major regulatory/technology/market change par scan update karo.',
      ].join('\n\n'),
      hindi: [
        'External strategic analysis organisation के बाहर की उन forces का अध्ययन है जो opportunities या threats पैदा कर सकती हैं। Management इन्हें सीधे control नहीं कर सकती, लेकिन monitor करके प्रभाव समझ सकती है और response चुन सकती है।',
        'Macro environment अनेक organisations को प्रभावित करता है। PESTEL scan में Political (सरकारी policy और stability), Economic (inflation, interest rates, income और growth), Social (demographics, lifestyle और attitudes), Technological (innovation, automation और platforms), Environmental (climate, resources और waste) तथा Legal (laws, regulation और compliance) factors देखे जाते हैं। PESTEL एक checklist है; यह अपने-आप priority तय नहीं करता।',
        'Micro या industry environment organisation के अधिक निकट है: customers, suppliers, competitors, intermediaries, substitutes और new entrants। Porter’s Five Forces industry में competition और returns पर pressure को पाँच forces से समझता है: existing rivalry, new entrants का threat, substitutes का threat, buyers की bargaining power और suppliers की bargaining power।',
        'Five Forces को केवल mechanical score न बनाएँ। हर force का driver क्या है, वह बढ़ रही है या घट रही है और pricing, cost, customer loyalty तथा returns पर उसका क्या प्रभाव है—यह analyse करें। एक segment में force strong और दूसरे में weak हो सकती है।',
        'Industry analysis में market size और growth, customer needs, strategic groups, product life cycle, distribution channels और Key Success Factors (KSFs) भी शामिल हो सकते हैं। KSFs वे capabilities या conditions हैं जिनमें अच्छा perform करना किसी industry में compete करने के लिए जरूरी है; ये समय के साथ बदल सकते हैं।',
        'अंतिम output evidence, time horizon, likelihood, impact और response owner के साथ prioritised opportunity/threat list होना चाहिए। Facts और assumptions अलग रखें तथा बड़े regulatory, technology या market change पर analysis update करें।',
      ].join('\n\n'),
    },
    example: {
      english: 'Example: a small electric-scooter manufacturer scans a proposed safety regulation (Legal), battery technology improvements (Technological), fuel prices and interest rates (Economic), and urban pollution concerns (Social/Environmental). In its industry analysis, it asks whether established brands can cut prices (rivalry), whether battery suppliers are concentrated (supplier power), and whether public transport or e-bikes are substitutes. It then prioritises certified battery safety and service coverage as potential success factors rather than assuming every PESTEL factor matters equally.',
      hinglish: 'Example: ek electric-scooter maker new safety regulation (Legal), better battery tech (Technological), fuel prices/interest rates (Economic) aur city pollution concern (Social/Environmental) scan karta hai. Industry analysis mein dekhega established brands price war kar sakte hain (rivalry), battery suppliers concentrated hain (supplier power), aur public transport/e-bikes substitute hain ya nahi. Is basis par certified battery safety aur service network ko possible KSF maan sakta hai.',
      hindi: 'उदाहरण: एक electric-scooter maker नई safety regulation (Legal), बेहतर battery technology (Technological), fuel prices और interest rates (Economic), तथा city pollution concerns (Social/Environmental) scan करता है। Industry analysis में वह देखता है कि established brands price war कर सकते हैं या नहीं, battery suppliers concentrated हैं या नहीं, और public transport/e-bikes substitutes हैं या नहीं। इसके आधार पर certified battery safety और service network को संभावित KSF माना जा सकता है।',
    },
    simpler: {
      english: 'External analysis asks: what is changing around the business, who has power over it, what alternatives can customers choose, and which outside changes could help or hurt? PESTEL scans the big picture; Five Forces looks at industry competition.',
      hinglish: 'External analysis ka simple sawaal: business ke aas-paas kya badal raha hai, kiski bargaining power hai, customer ke paas alternatives kya hain aur kaunsi outside change help ya hurt karegi? PESTEL big picture dekhta hai; Five Forces industry competition.',
      hindi: 'External analysis पूछता है: business के आसपास क्या बदल रहा है, किसके पास bargaining power है, customer के पास कौन-से alternatives हैं और कौन-सा बाहरी बदलाव मदद या नुकसान करेगा? PESTEL व्यापक वातावरण देखता है; Five Forces industry competition देखता है।',
    },
    quiz: {
      english: 'A retailer faces low-cost online entrants, powerful branded suppliers, many similar stores and customers who compare prices instantly. Identify the relevant Five Forces and explain which additional fact you would need before concluding whether the industry is attractive.',
      hinglish: 'Ek retailer ko low-cost online entrants, powerful branded suppliers, similar stores ki heavy rivalry aur instant price compare karne wale customers face karne padte hain. Relevant Five Forces identify kar aur industry attractive hai ya nahi decide karne se pehle kaunsi extra information chahiye, bata.',
      hindi: 'एक retailer को low-cost online entrants, powerful branded suppliers, समान stores की rivalry और तुरंत price compare करने वाले customers का सामना करना पड़ता है। Relevant Five Forces identify करें और industry attractive है या नहीं तय करने से पहले कौन-सी अतिरिक्त information चाहिए, बताएँ।',
    },
  },
  {
    chapterNumber: 3,
    title: 'Strategic Analysis: Internal Environment',
    keywords: [
      'strategic analysis internal environment', 'internal environment analysis', 'resources capabilities',
      'core competency', 'core competencies', 'value chain analysis', 'swot analysis',
      'vrio framework', 'strength weakness', 'capabilities based strategy', 'benchmarking',
      'आंतरिक वातावरण', 'संसाधन और क्षमताएँ', 'मूल दक्षता',
    ],
    answer: {
      english: [
        'Internal strategic analysis examines what the organisation owns, knows and can do well. It helps identify strengths that can support a strategy and weaknesses or capability gaps that may prevent successful execution.',
        'Resources are inputs available to the organisation. They may be tangible (cash, plant, inventory, technology infrastructure) or intangible (brand, patents, data, reputation, culture and relationships), and they include human resources. Capabilities are the organisation’s ability to combine and use resources through processes, knowledge and coordination.',
        'A core competence is a distinctive collective learning or capability that contributes materially to customer value, is difficult for competitors to copy and can support more than one product or market. A resource is not automatically a core competence merely because it is valuable or expensive.',
        'A VRIO-style check asks whether a resource or capability is Valuable, Rare, difficult to Imitate and supported by the Organisation. The four questions help assess whether it may create a temporary or more sustainable advantage. The framework is an analytical aid, not a guarantee that advantage will continue.',
        'Value-chain analysis separates activities that create and deliver value. Primary activities commonly include inbound logistics, operations, outbound logistics, marketing and sales, and service. Support activities include infrastructure, human-resource management, technology development and procurement. The point is to identify where value, cost, quality or differentiation is created—not simply to memorise labels.',
        'SWOT combines internal strengths and weaknesses with external opportunities and threats. Keep the distinction clear: an internal skill or process is usually a strength/weakness; a market trend or regulation is usually an opportunity/threat. Convert the analysis into actions—for example, use a strength to exploit an opportunity or address a weakness that increases exposure to a threat.',
        'Evidence matters. Use process data, customer feedback, cost and quality measures, employee capability, competitor benchmarks and performance across business units. Avoid calling something a strength without showing how it contributes to outcomes.',
      ].join('\n\n'),
      hinglish: [
        'Internal strategic analysis dekhta hai organisation ke paas kya hai, wo kya jaanti hai aur kya achha kar sakti hai. Isse strengths identify hoti hain jo strategy support karengi aur weaknesses/capability gaps jo execution rok sakte hain.',
        'Resources inputs hain—tangible (cash, plant, inventory, technology infrastructure) aur intangible (brand, patents, data, reputation, culture, relationships); human resources bhi included hain. Capabilities organisation ki ability hain resources ko processes, knowledge aur coordination se combine/use karne ki.',
        'Core competence ek distinctive collective learning/capability hai jo customer value mein meaningful contribution kare, competitors ke liye copy karna difficult ho aur multiple products/markets support kar sake. Valuable ya expensive resource apne-aap core competence nahi ban jata.',
        'VRIO check poochta hai: resource/capability Valuable hai? Rare hai? Imitate karna difficult hai? Organisation ise use karne ke liye organised hai? Inse temporary ya sustainable advantage ka indication milta hai. Framework guarantee nahi hai ki advantage forever rahega.',
        'Value-chain analysis value create/deliver karne wali activities ko separate karta hai. Primary activities: inbound logistics, operations, outbound logistics, marketing & sales, service. Support: infrastructure, HR management, technology development, procurement. Goal ye identify karna hai ki value, cost, quality ya differentiation kahan create ho rahi hai.',
        'SWOT internal strengths/weaknesses ko external opportunities/threats ke saath combine karta hai. Difference clear rakho: skill/process internal hota hai; market trend ya regulation external. Analysis ko action mein badlo—strength se opportunity exploit karo ya weakness fix karo jo threat ka impact badhati hai.',
        'Evidence use karo: process data, customer feedback, cost/quality measures, employee skills, competitor benchmark aur unit performance. Kisi cheez ko strength tab bolo jab outcome se uska link dikha sako.',
      ].join('\n\n'),
      hindi: [
        'Internal strategic analysis यह देखता है कि organisation के पास क्या है, वह क्या जानती है और क्या अच्छा कर सकती है। इससे ऐसी strengths पहचानते हैं जो strategy को support करें, तथा weaknesses या capability gaps जो execution रोक सकते हैं।',
        'Resources organisation के inputs हैं। ये tangible (cash, plant, inventory, technology infrastructure) या intangible (brand, patents, data, reputation, culture और relationships) हो सकते हैं; human resources भी इनमें शामिल हैं। Capabilities resources को processes, knowledge और coordination के माध्यम से combine और use करने की organisational ability हैं।',
        'Core competence ऐसी distinctive collective learning या capability है जो customer value में meaningful contribution करे, competitors के लिए copy करना कठिन हो और एक से अधिक products या markets support कर सके। कोई resource केवल valuable या expensive होने से core competence नहीं बनता।',
        'VRIO check पूछता है: क्या resource/capability Valuable है, Rare है, Imitate करना कठिन है और क्या Organisation उसे use करने के लिए organised है? इससे temporary या sustainable advantage की संभावना समझने में मदद मिलती है। यह guarantee नहीं है कि advantage हमेशा बना रहेगा।',
        'Value-chain analysis value create और deliver करने वाली activities को अलग करता है। Primary activities में inbound logistics, operations, outbound logistics, marketing और sales, तथा service आते हैं। Support activities में infrastructure, HR management, technology development और procurement आते हैं। उद्देश्य value, cost, quality या differentiation का स्रोत पहचानना है।',
        'SWOT internal strengths/weaknesses को external opportunities/threats से जोड़ता है। Internal skill या process सामान्यतः strength/weakness है; market trend या regulation सामान्यतः opportunity/threat है। SWOT को action में बदलें—strength से opportunity का लाभ लें या ऐसी weakness दूर करें जो threat का असर बढ़ाती है।',
        'Evidence के लिए process data, customer feedback, cost/quality measures, employee capability, competitor benchmarks और business-unit performance देखें। किसी चीज को strength कहने से पहले outcome से उसका संबंध दिखाएँ।',
      ].join('\n\n'),
    },
    example: {
      english: 'Example: a regional hospital has a trusted local brand, experienced clinicians and a reliable appointment system, but weak digital records and long billing queues. Brand and clinical capability may be strengths; weak records and billing processes are weaknesses. A new demand for tele-consultation is an external opportunity, while a new privacy regulation is an external threat. Value-chain analysis may show that better digital records improve both service quality and operating cost. The hospital should test whether its team and systems can deliver the change before promising it.',
      hinglish: 'Example: ek regional hospital ka local brand trusted hai, clinicians experienced hain aur appointments reliable hain, lekin digital records weak aur billing queue long hai. Brand/clinical skills strengths; records/billing weakness. Tele-consultation demand opportunity hai; new privacy regulation threat. Value-chain check dikha sakta hai ki digital records service quality aur cost dono improve kar sakte hain. Strategy promise karne se pehle team aur systems ki capability check karni hogi.',
      hindi: 'उदाहरण: एक regional hospital का local brand trusted है, clinicians experienced हैं और appointment system reliable है, लेकिन digital records कमजोर हैं और billing queues लंबी हैं। Brand और clinical capability strengths हो सकती हैं; records और billing weakness हैं। Tele-consultation की बढ़ती demand external opportunity है, जबकि नई privacy regulation external threat है। Value-chain analysis दिखा सकता है कि digital records service quality और cost दोनों सुधार सकते हैं।',
    },
    simpler: {
      english: 'Internal analysis asks: what are we good at, what do we lack, and can competitors copy our strengths? Resources are what we have; capabilities are what we can do with them; core competence is a capability that creates distinctive customer value.',
      hinglish: 'Internal analysis poochta hai: hum kis cheez mein achhe hain, kya missing hai aur competitor hamari strength copy kar sakta hai? Resources = humare paas kya hai; capabilities = un resources se kya kar sakte hain; core competence = aisi capability jo unique customer value create kare.',
      hindi: 'Internal analysis पूछता है: हम किस काम में अच्छे हैं, क्या कमी है और क्या competitors हमारी strengths copy कर सकते हैं? Resources बताते हैं हमारे पास क्या है; capabilities बताती हैं हम उनसे क्या कर सकते हैं; core competence ऐसी capability है जो अलग customer value बनाती है।',
    },
    quiz: {
      english: 'A firm owns a patented process that reduces unit cost. Competitors cannot legally copy it easily, but the firm has not trained staff or changed its production system to use it. Apply the four VRIO questions and explain why ownership alone may not produce an advantage.',
      hinglish: 'Ek firm ke paas patented process hai jo unit cost reduce karta hai. Competitors easily copy nahi kar sakte, lekin firm ne staff train nahi kiya aur production system bhi change nahi kiya. VRIO ke 4 questions apply kar aur bata sirf ownership se advantage kyun nahi milta.',
      hindi: 'एक firm के पास patented process है जो unit cost कम करता है। Competitors उसे आसानी से copy नहीं कर सकते, लेकिन firm ने staff train नहीं किया और production system भी नहीं बदला। VRIO के चार प्रश्न लागू करें और बताएँ कि केवल ownership से advantage क्यों नहीं मिलता।',
    },
  },
  {
    chapterNumber: 4,
    title: 'Strategic Choices',
    keywords: [
      'strategic choices', 'corporate level strategies', 'stability strategy', 'expansion strategy',
      'diversification strategy', 'retrenchment strategy', 'turnaround strategy', 'porter generic strategies',
      'cost leadership', 'differentiation strategy', 'focus strategy', 'ansoff matrix', 'bcg matrix',
      'रणनीतिक विकल्प', 'विस्तार रणनीति', 'लागत नेतृत्व', 'विविधीकरण',
    ],
    answer: {
      english: [
        'Strategic choice is the evaluation and selection of the direction and competitive approach that best fit the organisation’s objectives, external conditions and internal capabilities. A choice should be assessed for suitability, feasibility and acceptability—not only for how attractive it sounds.',
        'At corporate level, common directions include stability (continue the present scope with limited change), expansion (grow in existing or new products/markets), retrenchment (reduce scope or exit activities to restore viability) and combinations of these across business units. Turnaround is a focused recovery effort for a troubled business and may involve cost, asset, leadership and operating changes.',
        'Diversification moves into new products or markets. Related diversification seeks connections such as shared capabilities, customers, technology or channels; unrelated diversification enters areas with fewer operational links. Synergy should be demonstrated rather than assumed.',
        'At business level, Porter’s generic competitive approaches are cost leadership (compete through a lower cost base), differentiation (offer attributes customers value and are willing to pay for) and focus (serve a defined segment through cost focus or differentiation focus). A business must explain how its chosen approach is supported by activities and capabilities.',
        'Portfolio and growth tools support discussion. The Ansoff product-market matrix distinguishes market penetration, market development, product development and diversification. The BCG matrix considers relative market share and market growth to discuss stars, cash cows, question marks and dogs. These are simplified diagnostic tools; they do not replace detailed cash-flow, risk and capability analysis.',
        'A disciplined selection process defines criteria, generates realistic alternatives, tests assumptions, compares investment and risk, considers stakeholder impact and sets review triggers. The chosen strategy should include explicit trade-offs—what the organisation will not pursue.',
      ].join('\n\n'),
      hinglish: [
        'Strategic choice ka matlab objectives, external conditions aur internal capabilities ke fit ke basis par direction aur competitive approach select karna. Sirf attractive lagna enough nahi—suitability, feasibility aur acceptability check karo.',
        'Corporate level par common directions: Stability (current scope continue, limited change), Expansion (existing/new product ya market mein grow), Retrenchment (scope/activity reduce karke viability restore), aur different units mein combinations. Turnaround troubled business ko recover karne ka focused effort hai—cost, assets, leadership aur operations change ho sakte hain.',
        'Diversification new products ya markets mein entry hai. Related diversification mein shared capability, customer, technology ya channel jaise links hote hain. Unrelated diversification mein operational link kam hota hai. Synergy assume mat karo; demonstrate karo.',
        'Business level par Porter generic strategies: Cost Leadership (lower cost base se compete), Differentiation (valuable distinct attributes offer), Focus (specific segment serve—cost focus ya differentiation focus). Chosen strategy ko activities aur capabilities support karni chahiye.',
        'Ansoff matrix four growth routes batata hai: market penetration, market development, product development, diversification. BCG matrix relative market share aur market growth ke basis par stars, cash cows, question marks, dogs discuss karta hai. Ye simplified diagnostic tools hain, detailed investment/risk analysis ka substitute nahi.',
        'Selection process: criteria define karo, practical alternatives banao, assumptions test karo, investment/risk compare karo, stakeholders par impact samjho aur review triggers set karo. Strategy ke trade-offs bhi clear hon—organisation kya nahi karegi.',
      ].join('\n\n'),
      hindi: [
        'Strategic choice का अर्थ objectives, external conditions और internal capabilities के fit के अनुसार direction और competitive approach चुनना है। केवल attractive लगना पर्याप्त नहीं; suitability, feasibility और acceptability जाँचें।',
        'Corporate level पर सामान्य directions हैं: Stability (वर्तमान scope जारी रखना), Expansion (existing या नए products/markets में growth), Retrenchment (viability बहाल करने के लिए scope/activities घटाना) और अलग-अलग business units में इनका combination। Turnaround किसी troubled business को recover करने का focused प्रयास है जिसमें costs, assets, leadership या operations बदले जा सकते हैं।',
        'Diversification नए products या markets में प्रवेश है। Related diversification में capabilities, customers, technology या channels जैसे links होते हैं; unrelated diversification में operational links कम होते हैं। Synergy को केवल मान न लें—उसका evidence दें।',
        'Business level पर Porter की generic strategies हैं: Cost Leadership (lower cost base से compete), Differentiation (ऐसे attributes देना जिन्हें customers value करें), और Focus (defined segment को cost focus या differentiation focus से serve करना)। चुनी गई strategy को activities और capabilities support करनी चाहिए।',
        'Ansoff product-market matrix चार growth routes दिखाता है: market penetration, market development, product development और diversification। BCG matrix relative market share और market growth से stars, cash cows, question marks और dogs पर चर्चा करता है। ये simplified diagnostic tools हैं; detailed investment और risk analysis का विकल्प नहीं।',
        'Selection process में criteria तय करें, realistic alternatives बनाएँ, assumptions test करें, investment और risk compare करें, stakeholders पर impact देखें और review triggers तय करें। चुनी गई strategy के trade-offs भी स्पष्ट हों—organisation क्या नहीं करेगी।',
      ].join('\n\n'),
    },
    example: {
      english: 'Example: a successful regional dairy brand considers entering plant-based beverages. This is product development if offered to its current customer base with a new product, and diversification if it also enters unfamiliar customer/market territory. It should test customer demand, production know-how, supplier access, regulation, investment, channel fit and likely cannibalisation. Calling it “related diversification” is justified only if shared brand, distribution or capabilities create measurable benefits.',
      hinglish: 'Example: ek successful dairy brand plant-based beverages launch karna chahti hai. Existing customers ko new product dena product development ho sakta hai; new product ke saath unfamiliar market mein jaana diversification ho sakta hai. Demand, production knowledge, suppliers, regulation, investment, channels aur existing sales par cannibalisation test karo. Related diversification tabhi bolo jab shared brand/distribution/capability se measurable benefit ho.',
      hindi: 'उदाहरण: एक सफल dairy brand plant-based beverages में प्रवेश करना चाहती है। Existing customers को नया product देना product development हो सकता है; नए product के साथ unfamiliar market में जाना diversification हो सकता है। Demand, production capability, suppliers, regulation, investment, distribution और existing sales पर असर जाँचें। Related diversification तभी कहें जब shared brand या capabilities से measurable benefit हो।',
    },
    simpler: {
      english: 'Strategic choice means selecting the best realistic route. Grow, stay steady, shrink/recover, or change the business mix? Then decide how to compete: lower cost, be meaningfully different, or serve a narrow segment exceptionally well.',
      hinglish: 'Strategic choice matlab realistic options mein best route choose karna: grow karna, stable rehna, reduce/recover karna ya business mix change karna? Phir compete kaise karna hai decide karo—low cost, meaningful difference ya narrow segment ko best serve karke.',
      hindi: 'Strategic choice का अर्थ उपलब्ध realistic options में सही रास्ता चुनना है: growth, stability, retrenchment/turnaround या business mix बदलना। फिर तय करें कि compete lower cost, meaningful differentiation या किसी specific segment को बेहतर serve करके करना है।',
    },
    quiz: {
      english: 'A company has strong capabilities in cold-chain distribution and wants to launch frozen ready-to-cook meals for the same retailers it already serves. Identify the likely Ansoff direction and explain what evidence would be needed before calling the move related diversification.',
      hinglish: 'Ek company ki cold-chain distribution strong hai aur wo same retailers ko frozen ready-to-cook meals sell karna chahti hai. Ansoff direction identify kar aur related diversification bolne se pehle kaunsa evidence chahiye, explain kar.',
      hindi: 'एक company की cold-chain distribution capability मजबूत है और वह उन्हीं retailers को frozen ready-to-cook meals बेचना चाहती है। Ansoff direction identify करें और इसे related diversification कहने से पहले किस evidence की आवश्यकता होगी, समझाएँ।',
    },
  },
  {
    chapterNumber: 5,
    title: 'Strategy Implementation and Evaluation',
    keywords: [
      'strategy implementation and evaluation', 'strategy implementation', 'strategic control',
      'balanced scorecard', 'organisational structure strategy', 'change management strategy',
      'strategy evaluation', 'kpi strategic control', 'digital transformation strategy',
      'रणनीति कार्यान्वयन', 'रणनीति मूल्यांकन', 'संतुलित स्कोरकार्ड',
    ],
    answer: {
      english: [
        'Strategy implementation converts a selected strategic direction into coordinated action. A sound strategy can fail if responsibilities, resources, processes, incentives or organisational structure do not support it.',
        'Implementation typically requires alignment across structure, leadership, culture, people, systems and budgets. Structure should clarify decision rights and accountability; leadership communicates priorities and resolves conflicts; culture and incentives should reinforce desired behaviour; people need the skills and capacity; systems provide information and control; budgets allocate resources to priorities.',
        'Strategic change may be incremental or transformational. A practical change process explains why change is needed, identifies affected stakeholders, communicates the intended outcome, builds capability, handles resistance fairly, pilots where appropriate and monitors adoption. Resistance can signal poor communication, real operational risk or conflicting incentives—not simply unwillingness.',
        'Evaluation asks whether the strategy remains suitable and whether implementation is delivering intended results. Establish key performance indicators (KPIs), targets, owners, reporting frequency and thresholds for corrective action. Use both financial and non-financial measures, leading and lagging indicators, and compare actual performance with a meaningful baseline.',
        'Strategic control should test assumptions as well as results. Premise control checks critical assumptions; implementation control tracks milestones; strategic surveillance scans for unexpected developments; special alert control supports rapid review after a major event. Choose the control method to fit the risk and decision cycle.',
        'The Balanced Scorecard can organise measures across financial performance, customer outcomes, internal processes, and learning/growth. It encourages a broader view, but a scorecard is useful only when measures are linked to strategy, data quality is reliable and managers act on findings.',
        'Evaluation may lead to corrective action, resource reallocation, capability development or a strategy change. Avoid changing direction because of one noisy data point; understand causes, time lags and external shocks first.',
      ].join('\n\n'),
      hinglish: [
        'Strategy implementation selected direction ko coordinated action mein convert karta hai. Achhi strategy bhi fail ho sakti hai agar responsibilities, resources, processes, incentives ya organisation structure usko support na karein.',
        'Implementation ke liye structure, leadership, culture, people, systems aur budgets align hone chahiye. Structure decision rights/accountability clear kare; leadership priorities communicate kare; culture/incentives desired behaviour reinforce karein; employees ke paas skills aur capacity ho; systems information/control dein; budget priorities ko resources de.',
        'Strategic change incremental ya transformational ho sakta hai. Practical process: change kyun chahiye explain karo, stakeholders identify karo, outcome communicate karo, skills build karo, resistance fairly handle karo, possible ho toh pilot karo aur adoption monitor karo. Resistance kabhi-kabhi poor communication, real risk ya conflicting incentives ka signal hoti hai.',
        'Evaluation poochta hai strategy suitable bani hui hai ya nahi aur implementation intended results de raha hai ya nahi. KPIs, targets, owners, reporting frequency aur corrective-action thresholds define karo. Financial + non-financial, leading + lagging indicators use karo aur actual result ko meaningful baseline se compare karo.',
        'Strategic control assumptions aur results dono test karta hai. Premise control critical assumptions check karta hai; implementation control milestones track karta hai; strategic surveillance unexpected developments scan karta hai; special alert control major event par rapid review trigger karta hai.',
        'Balanced Scorecard measures ko 4 perspectives mein organise kar sakta hai: financial, customer, internal processes, learning & growth. Ye tabhi useful hai jab measures strategy se linked hon, data reliable ho aur managers findings par action lein.',
        'Evaluation ke baad corrective action, resource reallocation, capability development ya strategy change ho sakta hai. Ek noisy data point par direction change mat karo; causes, time lags aur external shocks analyse karo.',
      ].join('\n\n'),
      hindi: [
        'Strategy implementation चुनी गई strategic direction को coordinated action में बदलता है। अच्छी strategy भी विफल हो सकती है यदि responsibilities, resources, processes, incentives या organisational structure उसका support न करें।',
        'Implementation के लिए structure, leadership, culture, people, systems और budgets का alignment आवश्यक है। Structure decision rights और accountability स्पष्ट करे; leadership priorities communicate करे; culture और incentives वांछित behaviour को reinforce करें; people के पास skills और capacity हो; systems information/control दें; और budgets priorities को resources दें।',
        'Strategic change incremental या transformational हो सकता है। एक उपयोगी process change की आवश्यकता समझाता है, affected stakeholders पहचानता है, intended outcome communicate करता है, capability बनाता है, resistance को fair तरीके से address करता है, जहाँ उचित हो pilot करता है और adoption monitor करता है। Resistance poor communication, वास्तविक operational risk या conflicting incentives का संकेत भी हो सकती है।',
        'Evaluation जाँचता है कि strategy अभी भी suitable है या नहीं और implementation intended results दे रहा है या नहीं। KPIs, targets, owners, reporting frequency और corrective action thresholds तय करें। Financial/non-financial तथा leading/lagging indicators का उपयोग करें और actual performance को meaningful baseline से compare करें।',
        'Strategic control assumptions और results दोनों जाँचता है। Premise control critical assumptions देखता है; implementation control milestones track करता है; strategic surveillance unexpected developments scan करता है; special alert control किसी बड़े event पर rapid review कराता है।',
        'Balanced Scorecard measures को चार perspectives में रख सकता है: financial, customer, internal processes, learning और growth। यह तभी उपयोगी है जब measures strategy से linked हों, data reliable हो और managers findings पर action लें।',
        'Evaluation के बाद corrective action, resource reallocation, capability development या strategy change हो सकता है। केवल एक noisy data point पर direction न बदलें; causes, time lags और external shocks समझें।',
      ].join('\n\n'),
    },
    example: {
      english: 'Example: a bank adopts a digital-first service strategy. Implementation needs a secure technology platform, trained staff, redesigned customer journeys, clear cyber-risk ownership, revised service KPIs and funding. The Balanced Scorecard might track digital transaction cost (financial), customer resolution/satisfaction (customer), failed transactions and turnaround time (internal process), and staff digital certification (learning/growth). A rise in app downloads alone would not prove the strategy is succeeding.',
      hinglish: 'Example: ek bank digital-first service strategy leti hai. Implementation ke liye secure tech platform, trained staff, redesigned customer journey, cyber-risk owner, updated service KPIs aur budget chahiye. Balanced Scorecard mein transaction cost (financial), customer satisfaction/resolution (customer), failed transactions/turnaround time (internal), aur staff digital certification (learning-growth) track ho sakte hain. Sirf app downloads badhna success prove nahi karta.',
      hindi: 'उदाहरण: एक bank digital-first service strategy अपनाता है। Implementation के लिए secure technology platform, trained staff, redesigned customer journeys, cyber-risk ownership, नए service KPIs और funding चाहिए। Balanced Scorecard digital transaction cost, customer satisfaction, failed transactions/turnaround time और staff digital certification track कर सकता है। केवल app downloads बढ़ना strategy की सफलता सिद्ध नहीं करता।',
    },
    simpler: {
      english: 'Implementation is doing the strategy; evaluation is checking whether it works. Give people clear responsibility, skills, money and systems. Track a few meaningful indicators, find the cause of gaps and correct the action or the strategy.',
      hinglish: 'Implementation = strategy ko actually execute karna; evaluation = check karna ki kaam kar rahi hai ya nahi. People ko responsibility, skills, budget aur systems do. Meaningful indicators track karo, gap ka reason samjho aur action ya strategy correct karo.',
      hindi: 'Implementation का अर्थ strategy को वास्तव में लागू करना है; evaluation का अर्थ जाँचना कि वह काम कर रही है या नहीं। लोगों को responsibility, skills, budget और systems दें। Meaningful indicators track करें, gap का कारण समझें और action या strategy में सुधार करें।',
    },
    quiz: {
      english: 'A firm’s new online channel has rising sign-ups but falling repeat purchases, more complaints and higher fulfilment cost. Identify one measure for each Balanced Scorecard perspective and explain why sign-ups alone are an inadequate success measure.',
      hinglish: 'Firm ke new online channel par sign-ups badh rahe hain lekin repeat purchase gir raha hai, complaints badh rahi hain aur fulfilment cost high ho rahi hai. Balanced Scorecard ke har perspective ke liye ek measure do aur bata sign-ups alone success kyun prove nahi karte.',
      hindi: 'एक firm के नए online channel पर sign-ups बढ़ रहे हैं, लेकिन repeat purchases घट रहे हैं, complaints बढ़ रही हैं और fulfilment cost बढ़ रही है। Balanced Scorecard के प्रत्येक perspective के लिए एक measure दें और बताएँ कि sign-ups अकेले सफलता क्यों सिद्ध नहीं करते।',
    },
  },
];

export type ParakhSmBenchmarkFamily =
  | 'core_concept'
  | 'unseen_application'
  | 'exam_style_analysis'
  | 'edge_case_and_tradeoff'
  | 'attempt_source_sensitivity';

export const PARAKH_SM_BENCHMARKS = PACKS.flatMap((pack) => {
  const prompts: Array<{ family: ParakhSmBenchmarkFamily; question: string; purpose: string }> = [
    { family: 'core_concept', question: 'Explain the central ideas and distinctions in ' + pack.title + '.', purpose: 'Tests core concept understanding and terminology.' },
    { family: 'unseen_application', question: 'Apply ' + pack.title + ' to a new mid-sized Indian business scenario and justify the decisions.', purpose: 'Tests transfer to an unseen case.' },
    { family: 'exam_style_analysis', question: 'Write a structured exam answer on ' + pack.title + ' with headings, linked reasoning and a conclusion.', purpose: 'Tests answer organisation and completeness.' },
    { family: 'edge_case_and_tradeoff', question: 'Identify a limitation or trade-off that could make a seemingly sound ' + pack.title + ' recommendation fail.', purpose: 'Tests assumptions, limitations and balanced judgement.' },
    { family: 'attempt_source_sensitivity', question: 'Confirm whether this exact ' + pack.title + ' coverage is applicable to the student’s upcoming attempt and identify the correct ICAI source edition.', purpose: 'Must confirm exact attempt material and cannot infer applicability from an evergreen draft.' },
  ];
  return prompts.map((item, index) => ({
    id: 'intermediate-sm-chapter-' + pack.chapterNumber + '-' + (index + 1),
    chapterNumber: pack.chapterNumber,
    family: item.family,
    question: item.question,
    purpose: item.purpose,
  }));
});

function replyMode(message: string): ParakhSmMode {
  if (/\b(quiz|test me|ask me|practice question|question for me)\b|प्रश्नोत्तरी|टेस्ट लो|सवाल पूछो/i.test(message)) return 'quiz';
  if (/\b(example|illustrate|numerical example|case study|for example)\b|उदाहरण|मिसाल/i.test(message)) return 'example';
  if (/\b(simple|simpler|easy language|basic words|in simple words)\b|आसान भाषा|सरल भाषा/i.test(message)) return 'simpler';
  return 'answer';
}
function normalize(value: string): string {
  return String(value || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function isAttemptSensitive(message: string): boolean {
  return /\b(latest|most recent|recent amendment|amendment|amended|corrigendum|applicable for|upcoming attempt|my attempt|may 2027|september 2027|january 2027|exact syllabus|new syllabus)\b/i.test(message)
    || /\b(current|latest)\s+(?:syllabus|chapter|edition|material)\b/i.test(message);
}

export type ParakhSmKnowledgeMatch = {
  topicId: string;
  topicTitle: string;
  course: 'CA_INTERMEDIATE';
  paperCode: 'INT-G2-P6';
  section: 'Section B: Strategic Management';
  chapterNumber: number;
  syllabusApplicability: string;
  contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED';
  benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED';
  mode: ParakhSmMode;
  answer: string;
  source: { title: string; url: string };
};

export function searchParakhStrategicManagementKnowledge(input: {
  message: string;
  course: string;
  language: ParakhSmLanguage;
}): ParakhSmKnowledgeMatch | null {
  const message = String(input.message || '').trim();
  if (!message || input.course !== 'CA_INTERMEDIATE' || isAttemptSensitive(message)) return null;
  const normalized = ' ' + normalize(message) + ' ';
  const pack = PACKS.find((item) => item.keywords.some((keyword) => {
    const needle = normalize(keyword);
    return needle.length > 0 && normalized.includes(' ' + needle + ' ');
  }));
  if (!pack) return null;
  const mode = replyMode(message);
  const language = input.language;
  return {
    topicId: 'intermediate-sm-chapter-' + pack.chapterNumber,
    topicTitle: pack.title,
    course: 'CA_INTERMEDIATE',
    paperCode: 'INT-G2-P6',
    section: 'Section B: Strategic Management',
    chapterNumber: pack.chapterNumber,
    syllabusApplicability: SOURCE_APPLICABILITY,
    contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
    benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED',
    mode,
    answer: pack[mode][language],
    source: {
      title: 'ICAI Paper 6B Strategic Management — applicable for May 2027 exam onwards',
      url: SOURCE_URL,
    },
  };
}

export function buildParakhStrategicManagementReply(
  result: ParakhSmKnowledgeMatch,
  language: ParakhSmLanguage,
): string {
  const heading = language === 'hindi' ? 'अध्याय' : 'Chapter';
  const reviewNote = language === 'hinglish'
    ? '\n\n**Content status:** Ye PARAKH ka original author draft hai; qualified CA academic reviewer ne abhi independently verify nahi kiya. Exact attempt ka ICAI study material, RTP aur corrigendum check karna.'
    : language === 'hindi'
      ? '\n\n**Content status:** यह PARAKH का original authored draft है; qualified CA academic reviewer ने अभी independently verify नहीं किया है। Exact attempt के ICAI study material, RTP और corrigendum की जाँच करें।'
      : '\n\n**Content status:** This is an original PARAKH author draft and has not yet been independently verified by a qualified CA academic reviewer. Check the ICAI study material, RTP and corrigenda for your exact attempt.';
  const applicability = language === 'hinglish'
    ? '\n\n**Syllabus source:** ICAI ki official Paper 6B page May 2027 exam onwards ke liye ye chapter list karti hai. Agar tumhara attempt alag hai, exact applicable material recheck karo.'
    : language === 'hindi'
      ? '\n\n**पाठ्यक्रम स्रोत:** ICAI की official Paper 6B page May 2027 exam onwards के लिए यह chapter list करती है। आपका attempt अलग हो तो applicable material दोबारा जाँचें।'
      : '\n\n**Syllabus source:** ICAI’s official Paper 6B page lists this chapter for May 2027 exams onwards. Recheck the applicable material if your attempt differs.';
  return '**' + heading + ' ' + result.chapterNumber + ': ' + result.topicTitle + '**\n\n'
    + result.answer + applicability + reviewNote;
}

export function getParakhStrategicManagementInventory() {
  return {
    course: 'CA_INTERMEDIATE' as const,
    paperCode: 'INT-G2-P6' as const,
    paperTitle: 'Financial Management and Strategic Management',
    section: 'Section B: Strategic Management' as const,
    sourceCheckedAt: '2026-11-08',
    sourceUrl: SOURCE_URL,
    sourceIndexUrl: SOURCE_INDEX_URL,
    syllabusApplicability: SOURCE_APPLICABILITY,
    chapterCount: PACKS.length,
    authoredContentCount: PACKS.length,
    humanReviewedContentCount: 0 as const,
    benchmarkCaseCount: PARAKH_SM_BENCHMARKS.length,
    humanReviewedBenchmarkCount: 0 as const,
    chapters: PACKS.map((item) => ({
      chapterNumber: item.chapterNumber,
      title: item.title,
      module: 'Section B: Strategic Management',
      units: [] as string[],
      contentStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED' as const,
      benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED' as const,
    })),
    limitations: [
      'Official ICAI catalogue page is headed Applicable for May 2027 Exam Onwards; earlier or later attempt applicability must be separately checked.',
      'Five original chapter drafts exist in English, Hindi and Hinglish; none has been human-reviewed.',
      'Twenty-five benchmark prompts are defined but have no approved answer keys and have not been evaluated.',
      'The drafts are original teaching notes and do not reproduce or mirror ICAI study-material text.',
    ],
  };
}
