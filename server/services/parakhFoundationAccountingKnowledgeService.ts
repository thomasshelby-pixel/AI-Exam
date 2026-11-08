export type ParakhFoundationAccountingLanguage = 'english' | 'hindi' | 'hinglish';
export type ParakhFoundationAccountingMode = 'answer' | 'example' | 'simpler' | 'quiz';
type Localised = Record<ParakhFoundationAccountingLanguage, string>;
type ChapterPack = { chapterNumber: number; title: string; aliases: string[]; answer: Localised; example: Localised; simpler: Localised; quiz: Localised };

export const PARAKH_FOUNDATION_ACCOUNTING_SOURCE_URL = 'https://www.icai.org/post/sm-foundation-p1-may2027';
export const PARAKH_FOUNDATION_ACCOUNTING_APPLICABILITY = 'ICAI official Foundation Paper 1 page lists these chapters as Relevant for May 2027 and Onwards Examination. Check the exact attempt edition, corrigendum and applicable accounting standards before relying on attempt-sensitive treatment.';

const CHAPTERS: ChapterPack[] = [
  {
    chapterNumber: 1, title: 'Theoretical Framework',
    aliases: ['theoretical framework', 'meaning and scope of accounting', 'accounting concepts principles and conventions', 'capital and revenue expenditure', 'capital expenditure', 'revenue expenditure', 'contingent assets and liabilities', 'accounting policies', 'valuation principles', 'accounting estimates', 'accounting standards', 'लेखांकन सैद्धांतिक ढाँचा', 'पूंजीगत और राजस्व व्यय'],
    answer: {
      english: 'Accounting identifies, measures, records, classifies and communicates financial information to users for decisions. The accounting process depends on concepts and conventions that support consistency and understandability. The business entity concept separates business transactions from the owner’s personal transactions; going concern assumes continuation unless evidence indicates otherwise; money measurement records items measurable in money; accounting period divides business life into reporting periods; dual aspect reflects that every transaction has equal debit and credit effects; accrual recognises income and expenses when earned or incurred, not merely when cash moves; and consistency supports comparable treatment over time. Capital expenditure creates or improves a long-term resource or capacity, while revenue expenditure relates to current operations; classification depends on substance and benefit, not merely size. A contingent liability depends on uncertain future events and is generally disclosed where required rather than automatically recognised; treatment of contingent assets is cautious. Accounting policies are specific principles and methods selected; estimates involve judgement under uncertainty. Standards provide authoritative requirements and must be checked for the relevant reporting entity and period.',
      hinglish: 'Accounting financial information identify, measure, record, classify aur communicate karta hai. Concepts consistency dete hain: business entity owner se separate; going concern continuation assume; money measurement monetary items record; accounting period reporting intervals; dual aspect equal debit-credit effect; accrual income/expense earn/incur hone par, cash par nahi; consistency comparable treatment. Capital expenditure long-term resource/capacity create ya improve karta hai; revenue expenditure current operations se related hota hai. Contingent liability uncertain future event par depend karti hai aur applicable rule ke hisaab se disclose ho sakti hai; contingent asset par cautious treatment hota hai. Accounting policy chosen method hai; estimate uncertainty ke beech judgement hai. Standards exact entity aur period ke liye verify karo.',
      hindi: 'Accounting financial information को identify, measure, record, classify और communicate करता है। Concepts में business entity, going concern, money measurement, accounting period, dual aspect, accrual और consistency शामिल हैं। Accrual में income earned और expense incurred होने पर record होते हैं, केवल cash receipt/payment पर नहीं। Capital expenditure long-term resource या capacity बनाता/सुधारता है; revenue expenditure current operations से संबंधित होता है। Contingent liability uncertain future event पर निर्भर करती है और applicable rule के अनुसार disclose की जा सकती है; contingent asset के लिए सावधानीपूर्ण treatment होता है। Accounting policy चुना हुआ method है, जबकि accounting estimate uncertainty के बीच judgement है। Standards को relevant entity और period के लिए verify करें।',
    },
    example: {
      english: 'A business buys machinery for ₹5,00,000 and incurs ₹20,000 installation cost necessary to bring it into working condition. The amount may form part of the asset’s cost under the applicable accounting policy. Annual routine servicing of ₹8,000 generally relates to current operations and is treated as revenue expenditure. The substance and future benefit, not the invoice label, drive classification.',
      hinglish: 'Business machine ₹5,00,000 mein kharidta hai aur working condition tak lane ke liye ₹20,000 installation deta hai—ye asset cost ka part ho sakta hai. Annual routine service ₹8,000 current operation expense hai. Invoice label se nahi, nature aur future benefit se classify karo.',
      hindi: 'Business ने machinery ₹5,00,000 में खरीदी और उसे working condition में लाने के लिए ₹20,000 installation खर्च किया। यह asset cost का हिस्सा हो सकता है। Annual routine servicing ₹8,000 current expense है।',
    },
    simpler: {
      english: 'The framework gives common rules for deciding what to record, when to record it and how to present it. Always classify expenditure by its real nature and benefit.',
      hinglish: 'Framework batata hai kya record karna, kab record karna aur kaise present karna. Expenditure ko real nature aur benefit se classify karo.',
      hindi: 'Framework बताता है क्या record करना है, कब करना है और कैसे present करना है। Expenditure को उसकी वास्तविक nature और benefit के आधार पर classify करें।',
    },
    quiz: {
      english: 'A sole proprietor pays a personal holiday bill from the business bank account. Explain the accounting concept involved and the effect on the business records.',
      hinglish: 'Sole proprietor personal holiday bill business bank se pay karta hai. Kaunsa accounting concept apply hoga aur business records par kya effect hoga?',
      hindi: 'Sole proprietor personal holiday bill business bank account से pay करता है। कौन-सा accounting concept लागू होगा और business records पर क्या प्रभाव होगा?',
    },
  },
  {
    chapterNumber: 2, title: 'Accounting Process',
    aliases: ['accounting process', 'journal entries', 'ledger', 'trial balance', 'subsidiary books', 'cash book', 'rectification of errors', 'posting journal', 'journalising', 'लेखांकन प्रक्रिया', 'जर्नल प्रविष्टियाँ', 'खाता बही', 'तलपट'],
    answer: {
      english: 'The accounting process starts with source documents and analysis of transactions, followed by journalising, posting to ledger accounts, balancing accounts and preparing a trial balance. Subsidiary books record frequent transactions by type, such as purchases, sales, returns and bills; a cash book records cash/bank and may also include discount or petty-cash columns depending on its format. A trial balance tests the arithmetic equality of debit and credit balances but does not prove that every transaction is correct. Errors of omission, commission, principle, original entry, reversal or compensating errors may remain undetected. Rectification depends on whether the error is found before or after preparing the trial balance and whether a suspense account was used. The double-entry system records equal debit and credit amounts, but the account selection must follow the transaction’s economic substance. Keep an audit trail from source document through journal and ledger to the trial balance.',
      hinglish: 'Accounting process source document se start hota hai: transaction analyse, journal entry, ledger posting, account balancing aur trial balance. Subsidiary books repetitive purchases/sales/returns/bills record karte hain. Cash book cash/bank transactions record karti hai. Trial balance debit-credit arithmetic equality check karta hai, lekin correctness guarantee nahi—omission, commission, principle, original entry, reversal aur compensating errors remain kar sakte hain. Rectification error ke type aur trial balance/suspense account stage par depend karta hai. Double entry mein equal debit-credit hota hai, par account selection transaction ki substance se hota hai.',
      hindi: 'Accounting process source documents से शुरू होता है: transaction analysis, journalising, ledger posting, balancing और trial balance। Subsidiary books repetitive transactions record करते हैं; cash book cash/bank entries रखती है। Trial balance debit-credit की arithmetic equality जाँचता है, लेकिन correctness की guarantee नहीं देता। Omission, commission, principle, original entry, reversal और compensating errors रह सकते हैं। Rectification error के प्रकार तथा trial balance/suspense account stage पर निर्भर करता है।',
    },
    example: {
      english: 'Goods are purchased on credit for ₹12,000. The entry is Purchases Dr ₹12,000; To Supplier ₹12,000. The purchases day book captures the transaction, the supplier ledger is credited and purchases account is debited through posting. The trial balance may still agree even if the wrong supplier account was credited.',
      hinglish: 'Credit par goods ₹12,000 purchase: Purchases Dr 12,000; To Supplier 12,000. Purchases book mein entry, supplier ledger credit aur purchases account debit post hoga. Wrong supplier ko credit karne par bhi trial balance agree kar sakta hai.',
      hindi: 'Credit पर goods ₹12,000 खरीदे: Purchases Dr ₹12,000; To Supplier ₹12,000। Entry purchases book में जाएगी और संबंधित ledger accounts में post होगी। गलत supplier account credit होने पर भी trial balance agree कर सकता है।',
    },
    simpler: {
      english: 'Documents support transactions; journals record them first; ledgers group them by account; the trial balance checks debit-credit totals.',
      hinglish: 'Document transaction prove karta hai; journal first record; ledger account-wise group; trial balance debit-credit totals check karta hai.',
      hindi: 'Documents transaction का आधार हैं; journal पहली entry करता है; ledger account-wise record रखता है; trial balance debit-credit totals जाँचता है।',
    },
    quiz: {
      english: 'A credit sale is completely omitted from the books. Explain why the trial balance may still agree and how the error should be rectified when discovered.',
      hinglish: 'Credit sale completely books se omit ho gayi. Trial balance phir bhi agree kyun kar sakta hai aur discovery par rectification kya hoga?',
      hindi: 'Credit sale पूरी तरह books से omit हो गई। Trial balance फिर भी agree क्यों कर सकता है और पता चलने पर rectification कैसे होगा?',
    },
  },
  {
    chapterNumber: 3, title: 'Bank Reconciliation Statement',
    aliases: ['bank reconciliation statement', 'brs', 'cash book and pass book', 'bank overdraft reconciliation', 'unpresented cheques', 'uncredited deposits', 'bank reconciliation', 'बैंक समाधान विवरण', 'बीआरएस'],
    answer: {
      english: 'A Bank Reconciliation Statement explains the difference between the bank balance in the cash book and the balance shown by the bank statement/pass book at a particular date. Differences arise from timing items—cheques issued but not yet presented, deposits recorded but not yet credited—and items recorded by the bank or business at different times, such as bank charges, interest, direct debits, standing instructions, dishonoured cheques or collection credits. First identify the starting balance and whether it is favourable or an overdraft; then apply each item with the correct sign. If starting from the cash-book balance, add items that make the bank statement balance higher and deduct items that make it lower, subject to the precise item and overdraft convention. Update the cash book for entries not yet recorded by the business before preparing the reconciliation when the question requires. A BRS is not a substitute for investigating unexplained differences.',
      hinglish: 'BRS cash book ke bank balance aur bank statement/pass book ke balance ka difference explain karta hai. Timing items: issued cheque not presented, deposit not credited. Other items: bank charges, interest, direct debit, standing instruction, dishonoured cheque. Start balance identify karo—favourable ya overdraft—phir item ke correct sign se add/less karo. Business books mein absent bank charges etc pehle cash book update karne pad sakte hain. Unexplained difference ko sirf BRS mein adjust karke ignore mat karo.',
      hindi: 'Bank Reconciliation Statement cash book के bank balance और bank statement/pass book के balance का अंतर समझाता है। Timing differences में issued but unpresented cheques तथा uncredited deposits आते हैं। अन्य items में bank charges, interest, direct debits, standing instructions और dishonoured cheques शामिल हो सकते हैं। पहले starting balance तथा overdraft/favourable nature पहचानें, फिर प्रत्येक item का सही add/less effect लागू करें।',
    },
    example: {
      english: 'Cash-book favourable balance is ₹20,000. Cheques issued but not presented are ₹5,000; deposits not yet credited are ₹3,000; bank charges not entered in the cash book are ₹500. Bank statement balance = ₹20,000 + ₹5,000 − ₹3,000 − ₹500 = ₹21,500 when starting from the pre-adjustment cash-book balance. Alternatively, first update the cash book to ₹19,500 for bank charges, then add unpresented cheques and subtract uncredited deposits: ₹19,500 + ₹5,000 − ₹3,000 = ₹21,500.',
      hinglish: 'Cash-book favourable ₹20,000; issued not presented ₹5,000; deposit not credited ₹3,000; bank charges ₹500 cash book mein absent. Pehle cash book ₹19,500 karo; phir timing items: ₹19,500 + ₹5,000 − ₹3,000 = bank statement ₹21,500. Starting balance/approach consistent rakho.',
      hindi: 'Cash-book balance ₹20,000 है; unpresented cheques ₹5,000, uncredited deposit ₹3,000 और bank charges ₹500 हैं। पहले cash book को ₹19,500 करें; फिर timing items adjust करें: ₹19,500 + ₹5,000 − ₹3,000 = ₹21,500 bank statement balance।',
    },
    simpler: {
      english: 'BRS is a bridge between two records. Identify why each record differs and use the correct direction—not a memorised add/less list.',
      hinglish: 'BRS do records ke beech bridge hai. Har difference ka reason samjho aur correct direction lagao, blind add/less mat karo.',
      hindi: 'BRS दो records के बीच bridge है। हर अंतर का कारण समझें और सही direction में adjustment करें।',
    },
    quiz: {
      english: 'Starting from the pass-book overdraft, explain the direction of an unpresented cheque and a cheque deposited but not yet collected. State why the starting point matters.',
      hinglish: 'Pass-book overdraft se start karte hue unpresented cheque aur uncollected deposit ka effect samjhao. Starting point matter kyun karta hai?',
      hindi: 'Pass-book overdraft से शुरू करते हुए unpresented cheque और uncollected deposit का effect समझाएँ। Starting point क्यों महत्त्वपूर्ण है?',
    },
  },
  {
    chapterNumber: 4, title: 'Inventories',
    aliases: ['inventories', 'inventory valuation', 'valuation of inventory', 'fifo inventory', 'weighted average inventory', 'lower of cost and net realisable value', 'nrv inventory', 'closing stock', 'भंडार', 'स्टॉक मूल्यांकन'],
    answer: {
      english: 'Inventory includes goods held for sale, work in progress and materials or supplies consumed in production or service delivery. The key accounting question is the amount at which inventory is recognised at the reporting date. The general measurement principle is cost or net realisable value, whichever is lower, subject to the applicable standard. Cost includes purchase costs, conversion costs and other costs necessary to bring inventory to its present location and condition; abnormal waste, unnecessary storage and unrelated selling costs are generally not included. Cost formulas such as FIFO or weighted average are applied consistently to inventories with similar nature and use, as permitted by the applicable requirements. Net realisable value is estimated selling price less estimated completion and selling costs. Damaged, obsolete or slow-moving inventory may require a write-down. Physical existence alone does not prove that inventory is recorded at the right value.',
      hinglish: 'Inventory mein goods for sale, WIP aur production/service mein consume hone wale materials aate hain. Reporting date par cost ya NRV, whichever lower, applicable standard ke according. Cost mein purchase, conversion aur present location/condition tak lane ke necessary costs include; abnormal waste, unnecessary storage aur unrelated selling cost generally exclude. FIFO/weighted average permitted basis par consistent apply karo. NRV = estimated selling price − completion/selling costs. Damaged/obsolete/slow stock write-down demand kar sakta hai.',
      hindi: 'Inventory में sale के लिए goods, WIP तथा production/service में उपयोग होने वाले materials शामिल हैं। Reporting date पर सामान्य measurement cost या NRV में से lower amount है, applicable standard के अनुसार। Cost में purchase, conversion और present location/condition तक लाने के आवश्यक costs शामिल होते हैं। Abnormal waste और unrelated selling costs सामान्यतः शामिल नहीं होते। FIFO या weighted average consistent रूप से लागू करें। NRV = estimated selling price − completion तथा selling costs।',
    },
    example: {
      english: 'An item costs ₹120. Estimated selling price is ₹130, but completion cost is ₹8 and selling cost is ₹5. NRV = ₹117. Inventory is measured at ₹117, being lower than cost, assuming the estimates and applicable requirements are appropriate.',
      hinglish: 'Item cost ₹120; selling price ₹130; completion cost ₹8; selling cost ₹5. NRV ₹117. Lower of ₹120 and ₹117 = inventory ₹117.',
      hindi: 'Item cost ₹120, estimated selling price ₹130, completion cost ₹8 और selling cost ₹5 है। NRV ₹117 है; lower amount ₹117 पर inventory मापी जाएगी।',
    },
    simpler: {
      english: 'Do not show stock above the amount expected to be recovered from selling it after finishing and selling costs.',
      hinglish: 'Stock ko us amount se zyada show mat karo jo completion/selling costs ke baad recover hoga.',
      hindi: 'Stock को completion और selling costs के बाद recover होने वाली राशि से अधिक न दिखाएँ।',
    },
    quiz: {
      english: 'Inventory costing ₹90 is expected to sell for ₹100, but requires ₹7 completion and ₹6 selling costs. Calculate the reporting value and explain why gross selling price is not used.',
      hinglish: 'Inventory cost ₹90, expected sale ₹100, completion ₹7, selling ₹6. Reporting value nikaalo aur gross selling price kyun use nahi karte explain karo.',
      hindi: 'Inventory cost ₹90 है, expected selling price ₹100, completion cost ₹7 और selling cost ₹6 है। Reporting value निकालें और gross selling price क्यों नहीं लेते समझाएँ।',
    },
  },
  {
    chapterNumber: 5, title: 'Depreciation and Amortisation',
    aliases: ['depreciation and amortisation', 'depreciation', 'straight line method', 'written down value method', 'wdv method', 'useful life', 'residual value', 'amortisation', 'मूल्यह्रास', 'परिशोधन'],
    answer: {
      english: 'Depreciation is the systematic allocation of the depreciable amount of a tangible asset over its useful life. Depreciable amount is generally cost less residual value. Depreciation reflects consumption of economic benefits, not a market valuation of the asset. Under the straight-line method, annual depreciation is (cost − residual value) ÷ useful life. Under a reducing-balance method, depreciation is a fixed percentage of the carrying amount at the beginning of the period. The method should reflect the expected pattern of consumption and be reviewed when circumstances or estimates change. Amortisation applies the allocation concept to finite-life intangible assets. Distinguish depreciation from impairment and repairs: depreciation allocates cost over useful life; impairment addresses a carrying amount that may not be recoverable; routine repairs maintain current operating condition.',
      hinglish: 'Depreciation tangible asset ki depreciable amount ko useful life mein systematically allocate karta hai. Depreciable amount generally cost − residual value. Ye economic benefit consume hone ka allocation hai, market value nahi. Straight line = (cost − residual)/useful life. WDV/reducing balance = opening carrying amount par fixed percentage. Method consumption pattern reflect kare aur estimates change hone par review ho. Amortisation finite-life intangible asset par apply hota hai. Depreciation, impairment aur repairs alag concepts hain.',
      hindi: 'Depreciation tangible asset की depreciable amount को useful life में systematically allocate करता है। Depreciable amount सामान्यतः cost − residual value है। Straight-line method में annual depreciation = (cost − residual value) ÷ useful life। WDV method में opening carrying amount पर fixed rate लगता है। Method economic benefits के consumption pattern को reflect करना चाहिए। Finite-life intangible assets पर amortisation लागू होता है। Impairment और routine repairs अलग concepts हैं।',
    },
    example: {
      english: 'Machine cost ₹1,10,000, residual value ₹10,000 and useful life 5 years. Straight-line depreciation = (₹1,10,000 − ₹10,000) ÷ 5 = ₹20,000 per full year. If acquired part-way through the year, apply the period convention specified in the question and applicable policy.',
      hinglish: 'Machine cost ₹1,10,000, residual ₹10,000, useful life 5 years. SLM depreciation = ₹1,00,000/5 = ₹20,000 per full year. Part-year acquisition ho toh question/policy ke period basis ko follow karo.',
      hindi: 'Machine cost ₹1,10,000, residual value ₹10,000 और useful life 5 वर्ष है। SLM depreciation ₹20,000 प्रति full year होगा। Part-year use के लिए प्रश्न में दिया period basis अपनाएँ।',
    },
    simpler: {
      english: 'Depreciation spreads an asset’s depreciable cost across the periods that use it. It is not a yearly cash payment or market-price estimate.',
      hinglish: 'Depreciation asset ki depreciable cost ko useful periods mein spread karta hai. Ye annual cash payment ya market price estimate nahi.',
      hindi: 'Depreciation asset की depreciable cost को उसके useful periods में बाँटता है। यह cash payment या market-price estimate नहीं है।',
    },
    quiz: {
      english: 'An asset’s market price rises during the year. Explain why this fact alone does not mean depreciation should be reversed or omitted.',
      hinglish: 'Asset ka market price year mein increase ho gaya. Sirf is fact se depreciation reverse/omit kyun nahi karte?',
      hindi: 'Asset का market price वर्ष में बढ़ गया। केवल इस कारण depreciation reverse या omit क्यों नहीं करते?',
    },
  },
  {
    chapterNumber: 6, title: 'Bills of Exchange and Promissory Notes',
    aliases: ['bills of exchange and promissory notes', 'bill of exchange', 'promissory note', 'drawer drawee payee', 'discounting a bill', 'dishonour of bill', 'renewal of bill', 'retirement of bill', 'अनुमति पत्र', 'विनिमय पत्र'],
    answer: {
      english: 'A bill of exchange is a written unconditional order by one party directing another to pay a specified sum to a specified person or bearer, subject to applicable legal requirements. A promissory note is a written unconditional promise by its maker to pay. In a typical bill transaction, the drawer draws the bill, the drawee accepts it and becomes liable to pay at maturity, and the payee receives payment. The holder may retain the bill, discount it with a bank or endorse it to another party. If dishonoured, liability revives against parties as applicable and noting charges may arise. Renewal replaces an existing bill with a new arrangement, often involving interest; retirement before maturity may involve rebate. Dates, days of grace, maturity, discount, endorsement and dishonour entries must be applied exactly as specified in the question and the relevant law; do not guess a date convention.',
      hinglish: 'Bill of Exchange written unconditional order hai; Promissory Note maker ka written unconditional promise. Typical bill mein drawer bill draw karta, drawee accept karta aur maturity par liable hota, payee payment receive karta. Holder bill retain, bank se discount ya endorse kar sakta hai. Dishonour par liability applicable parties ke against revive hoti aur noting charges aa sakte hain. Renewal old bill replace karta, interest ho sakta hai; early retirement par rebate ho sakta hai. Date, grace days, maturity aur entries question ke facts aur relevant law ke according carefully apply karo.',
      hindi: 'Bill of Exchange एक written unconditional order है; Promissory Note maker का written unconditional promise है। सामान्य transaction में drawer bill draw करता है, drawee accept करता है और maturity पर payment के लिए liable होता है। Holder bill discount या endorse कर सकता है। Dishonour होने पर applicable parties की liability फिर उत्पन्न हो सकती है और noting charges आ सकते हैं। Renewal में नया bill बनता है; early retirement पर rebate हो सकता है। Dates तथा maturity conventions प्रश्न और relevant law के अनुसार लागू करें।',
    },
    example: {
      english: 'A draws a bill on B for ₹30,000 payable after two months. B accepts it. A may discount the bill with a bank before maturity; the bank pays the face value less discount. If B dishonours it, the holder records the amount due and any noting charges according to who paid them.',
      hinglish: 'A, B par ₹30,000 ka two-month bill draw karta hai; B accept karta hai. A maturity se pehle bank se discount kar sakta hai. B dishonour kare toh holder amount due plus noting charges record karega, facts ke basis par.',
      hindi: 'A ने B पर ₹30,000 का two-month bill draw किया और B ने accept किया। A इसे maturity से पहले bank से discount कर सकता है। Dishonour होने पर amount due तथा noting charges record होंगे।',
    },
    simpler: {
      english: 'A bill is an order to pay; a promissory note is a promise to pay. Identify who draws, accepts, holds and receives payment.',
      hinglish: 'Bill = pay karne ka order; promissory note = pay karne ka promise. Drawer, acceptor, holder aur payee identify karo.',
      hindi: 'Bill payment का order है; promissory note payment का promise है। Drawer, acceptor, holder और payee पहचानें।',
    },
    quiz: {
      english: 'A bill is discounted with a bank and is later dishonoured by the drawee. Explain the accounting effect on the drawer and why the noting charge must be considered.',
      hinglish: 'Bill bank se discount hua aur drawee ne baad mein dishonour kar diya. Drawer par accounting effect kya hoga aur noting charge kyun consider hoga?',
      hindi: 'Bill bank से discount हुआ और drawee ने बाद में dishonour कर दिया। Drawer पर accounting effect क्या होगा और noting charge क्यों consider होगा?',
    },
  },
  {
    chapterNumber: 7, title: 'Preparation of Final Accounts of Sole Proprietors',
    aliases: ['preparation of final accounts of sole proprietors', 'final accounts sole proprietor', 'trading account', 'profit and loss account', 'balance sheet sole trader', 'closing stock adjustment', 'outstanding expenses', 'prepaid expenses', 'accrued income', 'एकल स्वामी के अंतिम खाते'],
    answer: {
      english: 'Final accounts summarise the operating result and financial position of a sole proprietor for a reporting period. The trading account determines gross profit or loss by matching net sales with cost of goods sold. The profit and loss account adds indirect incomes and expenses to determine net profit or loss. The balance sheet presents assets, liabilities and capital at the reporting date. Adjustments ensure accrual and matching: closing inventory, outstanding expenses, prepaid expenses, accrued income, income received in advance, depreciation, bad debts and provision for doubtful debts, among others. Many adjustments have a dual effect—for example, outstanding expense increases the expense and creates a liability; prepaid expense reduces current expense and creates an asset. Follow the question’s presentation and avoid double counting an item already included in the trial balance.',
      hinglish: 'Final accounts period ka operating result aur financial position show karte hain. Trading account gross profit; P&L net profit; balance sheet assets, liabilities aur capital. Adjustments accrual/matching ensure karte hain: closing stock, outstanding/prepaid expense, accrued/advance income, depreciation, bad debts/provision. Many adjustments dual effect rakhte hain—outstanding expense P&L mein expense aur balance sheet mein liability. Trial balance mein item already included ho toh double count mat karo.',
      hindi: 'Final accounts reporting period का operating result और financial position बताते हैं। Trading account gross profit/loss, P&L net profit/loss और balance sheet assets, liabilities तथा capital दिखाती है। Adjustments में closing stock, outstanding/prepaid expenses, accrued/advance income, depreciation और doubtful debts आते हैं। कई adjustments का dual effect होता है; जैसे outstanding expense P&L में expense और balance sheet में liability बनाता है।',
    },
    example: {
      english: 'Rent of ₹12,000 for March remains unpaid at year-end. The profit and loss account includes the ₹12,000 expense and the balance sheet includes ₹12,000 outstanding rent liability. If the trial balance already includes the full rent expense but not the outstanding amount, do not add the expense twice.',
      hinglish: 'March rent ₹12,000 unpaid hai. P&L mein ₹12,000 expense; balance sheet mein ₹12,000 outstanding liability. Trial balance mein expense already included ho toh double entry treatment carefully apply karo.',
      hindi: 'March का rent ₹12,000 unpaid है। P&L में ₹12,000 expense और balance sheet में ₹12,000 outstanding liability दिखाई जाएगी।',
    },
    simpler: {
      english: 'Trading shows gross profit; profit and loss shows net profit; the balance sheet shows what the business owns and owes.',
      hinglish: 'Trading gross profit batata hai; P&L net profit; balance sheet business ke assets aur liabilities.',
      hindi: 'Trading account gross profit, P&L net profit और balance sheet assets तथा liabilities दिखाती है।',
    },
    quiz: {
      english: 'Insurance of ₹24,000 paid covers 12 months, but only 9 months relate to the current year. Explain the profit and loss and balance-sheet treatment.',
      hinglish: 'Insurance ₹24,000 paid hai 12 months ke liye, current year mein 9 months hain. P&L aur balance-sheet treatment explain karo.',
      hindi: '₹24,000 insurance 12 months के लिए paid है, जिनमें 9 months current year से संबंधित हैं। P&L और balance-sheet treatment बताएँ।',
    },
  },
  {
    chapterNumber: 8, title: 'Financial Statements of Not-for-Profit Organisations',
    aliases: ['financial statements of not for profit organisations', 'not for profit organisation accounts', 'receipts and payments account', 'income and expenditure account', 'subscription accounting', 'npo accounts', 'गैर लाभकारी संस्थाओं के वित्तीय विवरण'],
    answer: {
      english: 'Not-for-profit organisations exist to provide services or pursue an objective rather than distribute profit to owners. Their accounting still needs to measure resources, obligations and the surplus or deficit for a period. A Receipts and Payments Account is a cash summary: it records cash/bank receipts and payments during the period, including capital and revenue items, regardless of accrual. An Income and Expenditure Account is prepared on the accrual basis and includes current-period revenue income and expenses to determine surplus or deficit. A Balance Sheet reports assets, liabilities and capital/fund. Adjustments are needed for outstanding and advance subscriptions, accrued expenses, prepaid expenses, consumables, specific donations and asset depreciation, depending on the facts and applicable treatment. Distinguish specific-purpose funds from general income and do not treat every receipt as income.',
      hinglish: 'NPO service/objective ke liye kaam karti hai, owner profit distribute nahi. Receipts & Payments cash summary hai—period ke cash/bank receipts/payments, capital/revenue dono, cash basis. Income & Expenditure accrual basis par current period income/expense se surplus/deficit nikalta hai. Balance sheet assets, liabilities aur fund dikhati hai. Outstanding/advance subscriptions, prepaid/outstanding expenses, consumables aur specific donations adjust karo. Har receipt income nahi hoti.',
      hindi: 'NPO services या objective के लिए काम करती है, owners को profit distribute करने के लिए नहीं। Receipts and Payments Account cash summary है और period के सभी cash/bank receipts तथा payments दिखाता है। Income and Expenditure Account accrual basis पर current-period income और expenses से surplus/deficit निकालता है। Balance Sheet assets, liabilities और fund दिखाती है। Outstanding/advance subscriptions और अन्य adjustments आवश्यक हो सकते हैं। प्रत्येक receipt income नहीं होती।',
    },
    example: {
      english: 'Subscriptions received during the year are ₹1,00,000. Opening outstanding subscriptions are ₹10,000 and closing outstanding are ₹15,000; opening advance is ₹4,000 and closing advance is ₹6,000. Current-year subscription income = ₹1,00,000 + ₹15,000 + ₹4,000 − ₹10,000 − ₹6,000 = ₹1,03,000, assuming the balances relate to the same subscription category.',
      hinglish: 'Subscriptions received ₹1,00,000; opening outstanding ₹10,000; closing outstanding ₹15,000; opening advance ₹4,000; closing advance ₹6,000. Current income = 1,00,000 +15,000 +4,000 −10,000 −6,000 = ₹1,03,000.',
      hindi: 'Received subscriptions ₹1,00,000, opening outstanding ₹10,000, closing outstanding ₹15,000, opening advance ₹4,000 और closing advance ₹6,000 हैं। Current income ₹1,03,000 होगा।',
    },
    simpler: {
      english: 'Receipts and Payments tracks cash. Income and Expenditure tracks the current period on an accrual basis. The balance sheet shows the fund and obligations.',
      hinglish: 'Receipts & Payments cash; Income & Expenditure accrual; Balance Sheet fund/assets/liabilities.',
      hindi: 'Receipts and Payments cash दिखाता है; Income and Expenditure accrual basis पर surplus/deficit; Balance Sheet fund और obligations।',
    },
    quiz: {
      english: 'A donation is received specifically to build a library. Explain why it should not automatically be treated as ordinary recurring income and what supporting information is needed.',
      hinglish: 'Library banane ke liye specific donation mili. Isse ordinary recurring income automatically kyun nahi treat karna chahiye? Kya info chahiye?',
      hindi: 'Library बनाने के लिए specific donation मिली। इसे सामान्य recurring income क्यों नहीं मानना चाहिए और कौन-सी supporting information चाहिए?',
    },
  },
  {
    chapterNumber: 9, title: 'Accounts from Incomplete Records',
    aliases: ['accounts from incomplete records', 'single entry system', 'statement of affairs', 'missing figures', 'incomplete records', 'capital comparison method', 'अपूर्ण अभिलेखों से खाते', 'एकल प्रविष्टि प्रणाली'],
    answer: {
      english: 'Incomplete records means the accounting information is insufficient to prepare full accounts using a complete double-entry system. A common approach is the statement-of-affairs method, which estimates opening and closing capital by listing assets and liabilities at each date. Profit may be derived as closing capital plus drawings minus additional capital introduced minus opening capital, adjusted for any other required items. The result is an estimate and depends on reliable asset/liability information. Reconstruct missing sales, purchases, cash, debtors and creditors using control accounts, total debtors/creditors methods, cash summaries and other available evidence. Identify private drawings, additional capital, bad debts, discounts, returns and asset disposals separately. Do not assume the statement of affairs is a balance sheet prepared under a complete accounting framework; it may be based on incomplete or estimated information.',
      hinglish: 'Incomplete records mein full double-entry info available nahi hoti. Statement of affairs se opening/closing capital estimate karte hain—assets minus liabilities. Profit = closing capital + drawings − additional capital − opening capital, other adjustments ke saath. Sales, purchases, debtors, creditors aur cash ko control accounts/cash summaries se reconstruct kar sakte ho. Drawings, additional capital, bad debts, discounts, returns aur asset disposal alag identify karo. Statement of affairs complete audited balance sheet nahi; estimates ho sakte hain.',
      hindi: 'Incomplete records में complete double-entry information उपलब्ध नहीं होती। Statement of affairs से opening तथा closing capital estimate किया जाता है। Profit = closing capital + drawings − additional capital introduced − opening capital, आवश्यक adjustments सहित। Sales, purchases, debtors, creditors और cash को control accounts तथा cash summaries से reconstruct किया जा सकता है। Drawings, additional capital, bad debts, discounts और asset disposals अलग रखें।',
    },
    example: {
      english: 'Opening capital is ₹2,00,000; closing capital ₹2,80,000; drawings ₹30,000; additional capital ₹20,000. Estimated profit = ₹2,80,000 + ₹30,000 − ₹20,000 − ₹2,00,000 = ₹90,000, before any further adjustments required by the facts.',
      hinglish: 'Opening capital ₹2,00,000; closing ₹2,80,000; drawings ₹30,000; additional capital ₹20,000. Profit = 2,80,000 +30,000 −20,000 −2,00,000 = ₹90,000.',
      hindi: 'Opening capital ₹2,00,000, closing capital ₹2,80,000, drawings ₹30,000 और additional capital ₹20,000 है। Estimated profit ₹90,000 होगा।',
    },
    simpler: {
      english: 'When records are incomplete, compare opening and closing net worth, then adjust for owner contributions and withdrawals to estimate profit.',
      hinglish: 'Records incomplete hon toh opening/closing net worth compare karo, phir owner contribution aur drawings adjust karke profit estimate karo.',
      hindi: 'Records अधूरे हों तो opening और closing net worth compare करें, फिर owner contributions तथा drawings adjust करके profit निकालें।',
    },
    quiz: {
      english: 'Closing capital is higher than opening capital, but the owner introduced additional capital during the year. Explain why the increase in capital is not automatically profit.',
      hinglish: 'Closing capital opening se zyada hai, lekin owner ne additional capital introduce kiya. Capital increase automatically profit kyun nahi?',
      hindi: 'Closing capital opening से अधिक है, लेकिन owner ने additional capital introduce किया। Capital में वृद्धि अपने-आप profit क्यों नहीं है?',
    },
  },
  {
    chapterNumber: 10, title: 'Partnership and LLP Accounts',
    aliases: ['partnership and llp accounts', 'partnership accounts', 'goodwill partnership', 'admission of partner', 'retirement of partner', 'death of partner', 'dissolution of partnership', 'sacrificing ratio', 'gaining ratio', 'लाभ साझेदारी खाते', 'साझेदारी लेखांकन'],
    answer: {
      english: 'Partnership accounts record the contributions, profit-sharing arrangements, changes in partners and settlement of balances on reconstitution or dissolution. The partnership deed governs profit-sharing ratio, interest on capital/drawings, salaries, commission and other terms; if a term is absent, apply the relevant default rules only after checking the applicable legal and examination requirements. On admission, calculate the new ratio and sacrificing ratio, adjust goodwill and revalue assets/liabilities as required. On retirement or death, calculate gaining ratio, settle the outgoing partner’s share, revaluation, reserves and goodwill. Goodwill is not a free-standing cash balance; its treatment follows the agreed method and facts. On dissolution, realise assets, settle external liabilities and partner loans, then distribute any balance among partners according to the appropriate order and capital accounts. LLP accounting also requires attention to the LLP agreement and entity-specific rules; do not assume every partnership entry automatically applies unchanged.',
      hinglish: 'Partnership accounts capital, profit share, partners changes aur settlement record karte hain. Partnership deed profit ratio, interest, salary, commission etc define karta hai; clause absent ho toh relevant default rule exact law/exam context se verify karo. Admission par new ratio/sacrificing ratio, goodwill, revaluation. Retirement/death par gaining ratio, outgoing share, reserves aur goodwill adjust. Goodwill cash balance nahi; agreed method follow karo. Dissolution mein assets realise, outsiders/liabilities aur partner loans settle, remaining capital partners ko distribute. LLP agreement/entity rules separate check karo.',
      hindi: 'Partnership accounts partners के capital, profit-sharing, reconstitution और dissolution को record करते हैं। Partnership deed profit-sharing ratio, interest, salary और commission जैसे terms तय करती है। Admission पर new ratio, sacrificing ratio, goodwill और revaluation; retirement/death पर gaining ratio और outgoing partner का settlement किया जाता है। Dissolution में assets realise, external liabilities तथा partner loans settle करके शेष राशि partners में बाँटी जाती है। LLP agreement और entity-specific requirements अलग verify करें।',
    },
    example: {
      english: 'A and B share profits 3:2. C is admitted for 1/5 share, acquired from A and B in their old profit-sharing ratio of 3:2. A sacrifices 3/25 and B sacrifices 2/25; the sacrificing ratio is 3:2. Confirm the exact new ratio and goodwill adjustment from the full facts before posting.',
      hinglish: 'A:B ratio 3:2. C ko 1/5 share A aur B se unke old ratio 3:2 mein sacrifice karwa kar diya. A sacrifice 3/25, B 2/25; sacrificing ratio 3:2. Full question ke facts se new ratio aur goodwill adjustment verify karo.',
      hindi: 'A और B का ratio 3:2 है। C को 1/5 share A और B से उनके पुराने ratio 3:2 में sacrifice करवा कर दिया गया। A का sacrifice 3/25 और B का 2/25 है; sacrificing ratio 3:2 होगा।',
    },
    simpler: {
      english: 'When partners change, recalculate who owns which share of future profit and compensate partners who give up part of their share.',
      hinglish: 'Partner change hone par future profit share recalculate karo aur jo partner share sacrifice karta hai usko goodwill/adjustment se compensate karo.',
      hindi: 'Partners बदलने पर future profit-sharing ratio फिर निकालें और sacrificing partners को उचित adjustment दें।',
    },
    quiz: {
      english: 'A partner retires and the remaining partners gain in a ratio different from their old profit-sharing ratio. Explain why the gaining ratio, not simply the old ratio, is relevant for goodwill adjustment.',
      hinglish: 'Partner retire hota hai aur remaining partners old ratio se different proportion mein gain karte hain. Goodwill ke liye gaining ratio kyun use hoga?',
      hindi: 'एक partner retire होता है और remaining partners अलग proportion में gain करते हैं। Goodwill adjustment में gaining ratio क्यों relevant है?',
    },
  },
  {
    chapterNumber: 11, title: 'Company Accounts',
    aliases: ['company accounts', 'issue of shares', 'forfeiture and re issue of shares', 'issue of debentures', 'bonus issue', 'rights issue', 'redemption of preference shares', 'redemption of debentures', 'कंपनी खाते', 'शेयर जारी करना', 'डिबेंचर जारी करना'],
    answer: {
      english: 'Company accounts record transactions involving share capital, securities premium, calls, forfeiture/reissue, debentures and specified capital changes. When shares are issued, distinguish application, allotment and call stages; consider whether amounts are received, outstanding, issued at premium or forfeited. Forfeiture removes the shareholder’s rights after valid action under the applicable rules; reissue is accounted for within the permitted conditions and the treatment of any balance is not an unrestricted profit. Debentures represent borrowing and create interest and repayment obligations; distinguish issue at par, premium or discount and the timing of interest. Bonus and rights issues change share capital/equity structure and must be treated according to the applicable company-law and accounting requirements. Redemption of preference shares or debentures involves specific funding, reserve and procedural conditions. This is a conceptual accounting overview: exact Companies Act requirements, permitted sources, limits, timelines and disclosures are attempt-sensitive and must be checked against current primary material.',
      hinglish: 'Company accounts share capital, securities premium, calls, forfeiture/reissue, debentures aur capital changes record karte hain. Shares issue mein application, allotment, calls separate; received/outstanding/premium/forfeiture track karo. Forfeiture applicable rules ke under rights remove karta hai; reissue balance ko unrestricted profit mat samjho. Debenture borrowing hai, interest/repayment obligation deta hai. Bonus/right issue equity structure change karte hain. Preference shares/debenture redemption mein specific funding/reserve/procedure rules hote hain. Exact Companies Act requirements, limits, timelines aur disclosures attempt-sensitive hain—current primary source se verify karo.',
      hindi: 'Company accounts share capital, securities premium, calls, forfeiture/reissue, debentures तथा capital changes record करते हैं। Shares issue में application, allotment और calls अलग रखे जाते हैं। Forfeiture तथा reissue applicable rules के अनुसार होते हैं; forfeiture balance को unrestricted profit न मानें। Debentures borrowing हैं और interest तथा repayment obligations बनाते हैं। Bonus/right issue equity structure बदलते हैं। Preference share तथा debenture redemption में specific funding और procedural conditions होती हैं। Exact Companies Act requirements, limits तथा timelines current primary sources से verify करें।',
    },
    example: {
      english: 'A company issues 1,000 shares of ₹10 each at par. Application money of ₹3 per share is received, followed by allotment of ₹4 and final call of ₹3. Cash/bank and share application/allotment/call accounts are recorded stage by stage. If any call is unpaid, the amount due is tracked separately.',
      hinglish: '1,000 shares of ₹10 at par issue. Application ₹3, allotment ₹4, final call ₹3 per share. Har stage par Bank aur Share Application/Allotment/Call accounts record karo; unpaid call separately track hoga.',
      hindi: '1,000 shares ₹10 each at par issue हुए। Application ₹3, allotment ₹4 और final call ₹3 प्रति share है। प्रत्येक stage की receipt तथा call entries अलग record करें; unpaid call अलग track होगा।',
    },
    simpler: {
      english: 'Company accounts track how share capital is raised, how borrowing is recorded and how capital changes are accounted for under the applicable rules.',
      hinglish: 'Company accounts batate hain share capital kaise raise hua, borrowing kaise record hui aur capital changes ka accounting kaise hoga.',
      hindi: 'Company accounts बताते हैं share capital कैसे raise हुआ, borrowing कैसे record हुई और capital changes का accounting कैसे होगा।',
    },
    quiz: {
      english: 'A shareholder fails to pay the final call and the shares are forfeited and later reissued. Identify the key accounting stages and explain why current legal conditions must be checked before assuming the treatment.',
      hinglish: 'Shareholder final call pay nahi karta; shares forfeit aur later reissue hoti hain. Accounting stages batao aur legal conditions current source se kyun check karni hain?',
      hindi: 'Shareholder final call नहीं देता; shares forfeit और बाद में reissue होते हैं। Key accounting stages बताएँ और legal conditions current source से क्यों जाँचनी चाहिए?',
    },
  },
];

export const PARAKH_FOUNDATION_ACCOUNTING_BENCHMARKS = CHAPTERS.flatMap((chapter) => {
  const items = [
    ['core_concept', 'Explain the key accounting concepts and treatment in ' + chapter.title + '.'],
    ['unseen_numerical_application', 'Solve a new Foundation-level numerical or accounting-entry case on ' + chapter.title + ' with workings.'],
    ['exam_style_presentation', 'Prepare a structured Foundation exam-style answer on ' + chapter.title + '.'],
    ['edge_case_and_common_error', 'Explain a common error or exception in ' + chapter.title + ' and how to avoid it.'],
    ['attempt_source_sensitivity', 'Verify the applicable ICAI edition, corrigendum and accounting-standard treatment for ' + chapter.title + '.'],
  ] as const;
  return items.map(([family, question], index) => ({
    id: 'foundation-accounting-chapter-' + chapter.chapterNumber + '-' + (index + 1),
    chapterNumber: chapter.chapterNumber,
    family,
    question,
  }));
});

export type ParakhFoundationAccountingMatch = {
  topicId: string;
  topicTitle: string;
  course: 'CA_FOUNDATION';
  paperCode: 'FND-P1';
  section: 'Accounting';
  chapterNumber: number;
  syllabusApplicability: string;
  contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED';
  benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED';
  mode: ParakhFoundationAccountingMode;
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
function modeOf(message: string): ParakhFoundationAccountingMode {
  if (/\b(quiz|test me|ask me|practice question)\b|प्रश्नोत्तरी|टेस्ट लो|सवाल पूछो/i.test(message)) return 'quiz';
  if (/\b(example|illustrate|case study|for example)\b|उदाहरण|मिसाल/i.test(message)) return 'example';
  if (/\b(simple|simpler|easy language|in simple words)\b|आसान भाषा|सरल भाषा/i.test(message)) return 'simpler';
  return 'answer';
}
function attemptSensitive(message: string): boolean {
  return /\b(latest|most recent|amendment|amended|corrigendum|applicable for|upcoming attempt|my attempt|exact syllabus|new syllabus|may 2027|current standard|current accounting standard)\b/i.test(message);
}

export function searchParakhFoundationAccountingKnowledge(input: {
  message: string;
  course: string;
  language: ParakhFoundationAccountingLanguage;
}): ParakhFoundationAccountingMatch | null {
  const message = String(input.message || '').trim();
  if (!message || input.course !== 'CA_FOUNDATION' || attemptSensitive(message)) return null;
  const normalized = ' ' + normalize(message) + ' ';
  const chapter = CHAPTERS.find((item) => item.aliases.some((alias) => {
    const needle = normalize(alias);
    return needle && normalized.includes(' ' + needle + ' ');
  }));
  if (!chapter) return null;
  return {
    topicId: 'foundation-accounting-chapter-' + chapter.chapterNumber,
    topicTitle: chapter.title,
    course: 'CA_FOUNDATION',
    paperCode: 'FND-P1',
    section: 'Accounting',
    chapterNumber: chapter.chapterNumber,
    syllabusApplicability: PARAKH_FOUNDATION_ACCOUNTING_APPLICABILITY,
    contentReviewStatus: 'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',
    benchmarkStatus: 'PROMPTS_DEFINED_NOT_EVALUATED',
    mode: modeOf(message),
    answer: chapter[modeOf(message)][input.language],
    source: {
      title: 'ICAI Foundation Paper 1: Accounting — relevant for May 2027 and onwards',
      url: PARAKH_FOUNDATION_ACCOUNTING_SOURCE_URL,
    },
  };
}

export function buildParakhFoundationAccountingReply(result: ParakhFoundationAccountingMatch, language: ParakhFoundationAccountingLanguage): string {
  const heading = language === 'hindi' ? 'अध्याय' : 'Chapter';
  const applicability = language === 'hinglish'
    ? '\n\n**Syllabus source:** ICAI ki official Foundation Paper 1 page is chapter ko May 2027 aur onwards ke liye relevant batati hai. Attempt alag ho toh exact edition/corrigendum check karo.'
    : language === 'hindi'
      ? '\n\n**पाठ्यक्रम स्रोत:** ICAI की official Foundation Paper 1 page इस chapter को May 2027 और onwards के लिए relevant बताती है। अलग attempt हो तो edition/corrigendum जाँचें।'
      : '\n\n**Syllabus source:** ICAI’s official Foundation Paper 1 page marks this chapter relevant for May 2027 and onwards. Recheck the edition and corrigendum if your attempt differs.';
  const review = language === 'hinglish'
    ? '\n\n**Content status:** Ye original PARAKH author draft hai; qualified CA Accounting reviewer ne verify nahi kiya. Accounting-standard aur company-account treatment exact attempt material se cross-check karo.'
    : language === 'hindi'
      ? '\n\n**Content status:** यह original PARAKH author draft है; qualified CA Accounting reviewer ने verify नहीं किया है। Accounting-standard और company-account treatment exact attempt material से cross-check करें।'
      : '\n\n**Content status:** This is an original PARAKH author draft and has not been verified by a qualified CA accounting reviewer. Cross-check accounting-standard and company-account treatment against the exact attempt material.';
  return '**' + heading + ' ' + result.chapterNumber + ': ' + result.topicTitle + '**\n\n'
    + result.answer + applicability + review;
}

/**
 * Uses signed balances: positive means favourable bank balance; negative means overdraft.
 * Starting from the adjusted cash-book balance, apply only timing items and bank-originated
 * entries not yet recorded in the cash book.
 */
export function reconcileBankStatementFromCashBook(input: {
  cashBookBalance: number;
  chequesIssuedNotPresented?: number;
  depositsNotCredited?: number;
  bankChargesNotRecorded?: number;
  bankInterestNotRecorded?: number;
  directDebitsNotRecorded?: number;
  dishonouredChequesNotRecorded?: number;
}): number {
  const values = Object.values(input);
  if (values.some((value) => value !== undefined && !Number.isFinite(value))) {
    throw new Error('BRS inputs must be finite numbers.');
  }
  return input.cashBookBalance
    + (input.chequesIssuedNotPresented || 0)
    - (input.depositsNotCredited || 0)
    - (input.bankChargesNotRecorded || 0)
    + (input.bankInterestNotRecorded || 0)
    - (input.directDebitsNotRecorded || 0)
    - (input.dishonouredChequesNotRecorded || 0);
}

export function getParakhFoundationAccountingInventory() {
  return {
    course: 'CA_FOUNDATION' as const,
    paperCode: 'FND-P1' as const,
    paperTitle: 'Accounting',
    sourceCheckedAt: '2026-11-08',
    sourceUrl: PARAKH_FOUNDATION_ACCOUNTING_SOURCE_URL,
    syllabusApplicability: PARAKH_FOUNDATION_ACCOUNTING_APPLICABILITY,
    chapterCount: CHAPTERS.length,
    authoredContentCount: CHAPTERS.length,
    humanReviewedContentCount: 0 as const,
    benchmarkCaseCount: PARAKH_FOUNDATION_ACCOUNTING_BENCHMARKS.length,
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
      'Official ICAI page marks the linked study material Relevant for May 2027 and Onwards Examination; confirm exact attempt and corrigendum.',
      'Eleven original chapter drafts exist in English, Hindi and Hinglish; none is human-reviewed.',
      'Fifty-five benchmark prompts are defined but have no approved answer keys and have not been evaluated.',
      'These are original notes and do not reproduce ICAI study material.',
    ],
  };
}
