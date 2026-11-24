export type ParakhFoundationQaLanguage='english'|'hindi'|'hinglish';
export type ParakhFoundationQaMode='answer'|'example'|'simpler'|'quiz';
type Localised=Record<ParakhFoundationQaLanguage,string>;
type QaChapter={chapterNumber:number;title:string;section:'Business Mathematics'|'Logical Reasoning'|'Statistics';units?:string[];aliases:string[];answer:Localised;example:Localised;simpler:Localised;quiz:Localised};

export const PARAKH_FOUNDATION_QA_SOURCE_URL='https://www.icai.org/post/24402';
export const PARAKH_FOUNDATION_QA_APPLICABILITY='ICAI official Foundation Paper 3 page marks this material Relevant for May 2027 and Onwards Examination. Verify the exact attempt edition and corrigendum before treating the chapter mapping as final.';

const CHAPTERS:QaChapter[]=[
{chapterNumber:1,title:'Ratio and Proportion, Indices, Logarithms',section:'Business Mathematics',aliases:['ratio and proportion','indices','index laws','logarithms','ratio proportion','अनुपात समानुपात','लघुगणक'],answer:{
english:'A ratio compares quantities measured in the same units and is simplified by dividing both terms by a common factor. If a:b=m:n, then the quantities are in the same proportion; direct proportion means both move in the same direction at a constant ratio, while inverse proportion means their product remains constant. For a:b=c:d, cross multiplication gives ad=bc. Indices express repeated multiplication: a^m×a^n=a^(m+n), a^m/a^n=a^(m−n), (a^m)^n=a^(mn), a^0=1 (for a≠0), and a^(−n)=1/a^n. Logarithms reverse exponentiation: if a^x=N, then log_a N=x. Laws include log_a(MN)=log_aM+log_aN, log_a(M/N)=log_aM−log_aN and log_a(M^k)=k log_aM, for valid positive arguments and base a>0, a≠1. Check units, common bases and domain restrictions before simplifying.',
hinglish:'Ratio same units wali quantities compare karta hai; common factor se simplify karo. Direct proportion mein ratio constant; inverse proportion mein product constant. a:b=c:d ho toh ad=bc. Indices ke laws: a^m×a^n=a^(m+n), division mein powers subtract, power on power multiply, a^0=1 (a≠0), negative power reciprocal. Log exponent ko reverse karta hai: a^x=N toh log_aN=x. Product ka log sum, quotient ka difference aur power ka multiplier hota hai. Log ke arguments positive, base positive aur 1 se different honi chahiye. Units aur domain check karo.',
hindi:'Ratio समान units वाली quantities की तुलना करता है। Direct proportion में ratio स्थिर और inverse proportion में product स्थिर रहता है। a:b=c:d के लिए ad=bc। Indices में समान base के multiplication पर powers जुड़ती हैं, division पर घटती हैं, power की power में multiply होती हैं; a^0=1 और a^(−n)=1/a^n। Logarithm exponentiation का inverse है: a^x=N तो log_aN=x। Product का log sum, quotient का difference और power का multiplier होता है। Log argument positive तथा base positive और 1 से अलग होना चाहिए।'
},example:{
english:'If 5 pens cost ₹60, then 8 pens at the same unit price cost 60×8/5=₹96. Also, log_2 32=5 because 2^5=32. Simplify 2^3×2^4=2^7=128.',
hinglish:'5 pens ₹60 ke hain toh 8 pens =60×8/5=₹96. log_2 32=5 kyunki 2^5=32. 2^3×2^4=2^7=128.',
hindi:'5 pens की कीमत ₹60 है तो 8 pens की कीमत ₹96 होगी। log_2 32=5 क्योंकि 2^5=32। 2^3×2^4=2^7=128।'
},simpler:{
english:'A ratio compares; proportion says two ratios are equal. Indices shorten repeated multiplication; logarithms tell you the power needed.',
hinglish:'Ratio compare karta hai, proportion equal ratios batata hai. Indices repeated multiplication short karte hain; log power batata hai.',
hindi:'Ratio तुलना करता है; proportion समान ratios बताता है। Indices repeated multiplication को छोटा लिखते हैं और logarithm आवश्यक power बताता है।'
},quiz:{
english:'If 12 workers complete a task in 15 days at the same efficiency, how many days would 20 workers take? Identify the type of proportion and show the calculation.',
hinglish:'12 workers task 15 days mein karte hain. Same efficiency par 20 workers kitne din lenge? Proportion type aur calculation batao.',
hindi:'12 workers एक काम 15 दिन में करते हैं। समान efficiency पर 20 workers कितने दिन लेंगे? Proportion का प्रकार और calculation बताइए।'
}},
{chapterNumber:2,title:'Equations',section:'Business Mathematics',aliases:['equations','linear equations','quadratic equations','simultaneous equations','roots of equation','समीकरण','द्विघात समीकरण'],answer:{
english:'An equation states that two expressions have equal values. A linear equation in one variable has the form ax+b=0 with a≠0 and solution x=−b/a. Simultaneous linear equations are solved together because the same unknowns must satisfy both; substitution, elimination or determinants may be used. A quadratic equation ax²+bx+c=0 (a≠0) has roots x=[−b±√(b²−4ac)]/(2a). The discriminant D=b²−4ac indicates the nature of real roots: D>0 gives two distinct real roots, D=0 equal real roots, D<0 no real roots. Word problems require defining the unknown, translating the relationship into equations and checking the solution against the original facts. Avoid dividing by a variable expression unless it is known to be non-zero.',
hinglish:'Equation do expressions ko equal batata hai. Linear ax+b=0 ka solution x=−b/a. Simultaneous equations mein same unknowns dono equations satisfy karte hain; substitution ya elimination use karo. Quadratic ax²+bx+c=0 ke roots formula se. Discriminant b²−4ac positive ho toh two distinct real roots, zero ho toh equal roots, negative ho toh real roots nahi. Word problem mein unknown define karo, relationship equation mein convert, solve aur original facts se verify karo.',
hindi:'Equation दो expressions की समानता बताता है। Linear equation ax+b=0 का solution x=−b/a है। Simultaneous equations में समान unknowns दोनों equations को satisfy करते हैं; substitution या elimination उपयोग करें। Quadratic equation के roots quadratic formula से मिलते हैं। Discriminant b²−4ac positive होने पर दो अलग real roots, zero पर बराबर roots और negative होने पर real roots नहीं होते। Word problem में unknown define करें, facts को equation में बदलें और उत्तर verify करें।'
},example:{
english:'Solve 2x+7=19: 2x=12, x=6. For x²−5x+6=0, factorise (x−2)(x−3)=0, so x=2 or 3.',
hinglish:'2x+7=19 ⇒2x=12 ⇒x=6. x²−5x+6=0 ⇒(x−2)(x−3)=0, roots 2 aur 3.',
hindi:'2x+7=19 से x=6। x²−5x+6=0 को (x−2)(x−3)=0 लिखने पर roots 2 और 3 हैं।'
},simpler:{
english:'Move terms carefully to isolate the unknown. For a quadratic, factorise or use the formula, then check both roots.',
hinglish:'Unknown ko isolate karo. Quadratic ko factorise ya formula se solve karo aur roots check karo.',
hindi:'Unknown को अलग करें। Quadratic को factorise या formula से solve करके roots जाँचें।'
},quiz:{
english:'A number increased by 7 is twice the number decreased by 5. Form an equation and solve for the number.',
hinglish:'Ek number mein 7 add karne par woh number se 5 kam ke double ke equal hai. Equation banao aur solve karo.',
hindi:'एक संख्या में 7 जोड़ने पर वह संख्या से 5 कम के दुगुने के बराबर है। Equation बनाकर हल करें।'
}},
{chapterNumber:3,title:'Linear Inequalities',section:'Business Mathematics',aliases:['linear inequalities','inequalities','number line inequalities','linear inequality','रैखिक असमिकाएँ','असमानताएँ'],answer:{
english:'An inequality compares expressions using <, >, ≤ or ≥. Solve a linear inequality using the same operations as an equation, with one critical exception: multiplying or dividing both sides by a negative number reverses the inequality sign. A compound inequality represents two conditions together and can be shown on a number line using open or closed endpoints. An open circle excludes the endpoint; a filled circle includes it. In applications, inequalities represent limits such as capacity, budget or minimum requirements. Translate the wording carefully: “at least” means ≥, “more than” means >, “at most” means ≤ and “less than” means <. The final answer should satisfy both the algebra and the context, including integer restrictions where relevant.',
hinglish:'Inequality <, >, ≤, ≥ se comparison hai. Equation ki tarah solve karo, par negative number se multiply/divide karte waqt sign reverse hota hai. Compound inequality multiple conditions dikhati hai. Number line par open circle endpoint exclude, filled circle include karta hai. “At least” ≥, “more than” >, “at most” ≤ aur “less than” < hota hai. Word problem ke context aur integer restriction check karo.',
hindi:'Inequality में <, >, ≤ या ≥ से तुलना की जाती है। Equation जैसे steps अपनाएँ, लेकिन negative number से multiply या divide करने पर inequality sign उलट जाता है। Compound inequality दो या अधिक conditions दिखाती है। Number line पर open circle endpoint को exclude और filled circle include करता है। “कम-से-कम” ≥, “से अधिक” >, “अधिकतम” ≤ और “से कम” < होता है।'
},example:{
english:'Solve −3x<12. Dividing by −3 reverses the sign: x>−4. The endpoint −4 is not included.',
hinglish:'−3x<12. −3 se divide karte waqt sign reverse: x>−4.',
hindi:'−3x<12 को −3 से divide करने पर sign उलटता है: x>−4।'
},simpler:{
english:'Solve normally, but reverse the sign whenever you multiply or divide by a negative number.',
hinglish:'Normal solve karo, bas negative se multiply/divide karo toh sign ulta.',
hindi:'सामान्य तरीके से हल करें, लेकिन negative से गुणा/भाग करने पर sign पलटें।'
},quiz:{
english:'A monthly budget cannot exceed ₹25,000. Fixed costs are ₹7,000 and variable cost is ₹90 per unit. Form the inequality for units x and find the maximum whole number of units.',
hinglish:'Budget max ₹25,000; fixed ₹7,000; variable ₹90/unit. x units ki inequality banao aur maximum whole units nikaalo.',
hindi:'Budget अधिकतम ₹25,000, fixed cost ₹7,000 और variable cost ₹90 प्रति unit है। x units की inequality बनाकर maximum whole units निकालें।'
}},
{chapterNumber:4,title:'Mathematics of Finance',section:'Business Mathematics',aliases:['mathematics of finance','simple interest','compound interest','annuity','present value','future value','effective rate','nominal rate','वित्तीय गणित','चक्रवृद्धि ब्याज','साधारण ब्याज'],answer:{
english:'Simple interest is calculated on the original principal: SI=P×r×t, with rate and time expressed consistently. Compound interest adds interest to principal at each compounding interval: FV=P(1+i)^n, where i is the rate per period and n the number of periods. Present value discounts a future amount: PV=FV/(1+i)^n. For an ordinary annuity with equal payments at the end of each period, the future value is R[((1+i)^n−1)/i] and present value is R[1−(1+i)^−n]/i. Payments at the beginning of periods require an annuity-due adjustment. Match rate frequency to payment frequency; a nominal annual rate compounded monthly is not automatically the effective annual rate. Financial decisions compare amounts at the same date, so time value of money is fundamental.',
hinglish:'Simple interest original principal par: SI=P×r×t. Compound interest mein interest principal mein add hota hai: FV=P(1+i)^n. Present value PV=FV/(1+i)^n. Equal end-period payments ordinary annuity hain; beginning-period payment annuity due. Rate per period aur number of periods consistent rakho. Nominal annual rate aur effective annual rate same nahi hote agar compounding multiple times ho. Different dates ke amounts compare karne ke liye time value of money use hota hai.',
hindi:'Simple interest मूल principal पर SI=P×r×t से निकाला जाता है। Compound interest में प्रत्येक अवधि का interest principal में जुड़ता है: FV=P(1+i)^n। Present value PV=FV/(1+i)^n है। समान end-period payments ordinary annuity हैं; beginning-period payments annuity due हैं। Rate और compounding frequency मिलाएँ। Nominal annual rate तथा effective annual rate अलग हो सकते हैं।'
},example:{
english:'₹10,000 invested at 10% compounded annually for 2 years grows to ₹10,000×1.1²=₹12,100. The present value of ₹12,100 due in two years at 10% is ₹10,000.',
hinglish:'₹10,000 ko 10% annual compound par 2 years: FV=10,000×1.1²=₹12,100. 2 saal baad ₹12,100 ka PV 10% par ₹10,000.',
hindi:'₹10,000 पर 10% annual compounding से 2 वर्षों बाद FV ₹12,100 होगा। उसी राशि का present value ₹10,000 है।'
},simpler:{
english:'Money today and money later are not equal. Compound interest grows money forward; discounting brings future money back to today.',
hinglish:'Aaj ka paisa aur future ka paisa equal nahi. Compounding future value banata hai; discounting present value.',
hindi:'आज का पैसा और भविष्य का पैसा समान नहीं। Compounding future value और discounting present value निकालता है।'
},quiz:{
english:'You can receive ₹50,000 today or ₹60,500 after two years. At a 10% annual compound rate, compare the two options using present value.',
hinglish:'₹50,000 aaj ya ₹60,500 2 saal baad. 10% annual compound rate par PV compare karo.',
hindi:'₹50,000 आज या ₹60,500 दो साल बाद मिल सकते हैं। 10% annual compound rate पर present value compare करें।'
}},
{chapterNumber:5,title:'Basic Concepts of Permutations and Combinations',section:'Business Mathematics',aliases:['permutations and combinations','permutation','combination','npr','ncr','factorial','क्रमचय और संचय','क्रमचय','संचय'],answer:{
english:'Permutations count arrangements where order matters; combinations count selections where order does not matter. For n distinct objects taken r at a time, permutations nPr=n!/(n−r)! and combinations nCr=n!/[r!(n−r)!]. The relation nPr=nCr×r! connects the two. Factorial n! is n×(n−1)×…×1, with 0!=1. If repetition is permitted or objects are identical, use a formula suited to the restrictions rather than applying nPr blindly. For arrangements with repeated identical items, divide n! by the factorials of the repeated counts. Translate the problem first: roles, seats and rankings usually involve order; committees and groups usually do not. Ensure r≤n and distinguish “at least”, “exactly” and “not together” conditions.',
hinglish:'Permutation mein order matter; combination mein order matter nahi. n distinct objects se r arrange: nPr=n!/(n−r)!; selection nCr=n!/[r!(n−r)!]. Relation nPr=nCr×r!. Factorial n! descending product; 0!=1. Repetition ya identical objects hon toh suitable adjustment chahiye. Seats/ranks/roles usually permutation; committee/group usually combination. “At least/exactly/not together” conditions carefully translate karo.',
hindi:'Permutation में order महत्त्वपूर्ण होता है; combination में order महत्त्वपूर्ण नहीं होता। n distinct objects में से r arrange करने के लिए nPr=n!/(n−r)! और select करने के लिए nCr=n!/[r!(n−r)!]। nPr=nCr×r!। Identical objects या repetition की अनुमति होने पर अलग treatment चाहिए। Seats/roles में order सामान्यतः महत्त्वपूर्ण है; committee selection में नहीं।'
},example:{
english:'From 5 students, choose a 3-member committee: 5C3=10. If assigning president, secretary and treasurer from 5 students, order/role matters: 5P3=60.',
hinglish:'5 students mein se 3-member committee: 5C3=10. President/secretary/treasurer roles assign karne hain toh 5P3=60.',
hindi:'5 students में से 3 की committee चुनना 5C3=10 है। तीन अलग पदों पर नियुक्ति 5P3=60 होगी।'
},simpler:{
english:'Ask: would swapping two selected people create a different outcome? If yes, permutation; if no, combination.',
hinglish:'Do logon ko swap karne se outcome different hota hai? Yes toh permutation; no toh combination.',
hindi:'दो लोगों को बदलने से outcome अलग होता है? हाँ तो permutation, नहीं तो combination।'
},quiz:{
english:'A class has 8 students. In how many ways can 2 students be selected for a debate team, and in how many ways can first and second speakers be assigned?',
hinglish:'8 students mein se 2 debate team ke liye select aur first/second speaker assign karne ke ways nikaalo.',
hindi:'8 students में से 2 को debate team के लिए चुनने और first/second speaker नियुक्त करने के तरीकों की संख्या निकालें।'
}},
{chapterNumber:6,title:'Sequence and Series – Arithmetic and Geometric Progressions',section:'Business Mathematics',aliases:['sequence and series','arithmetic progression','ap','geometric progression','gp','nth term ap','sum of ap','sum of gp','समांतर श्रेणी','गुणोत्तर श्रेणी'],answer:{
english:'A sequence is an ordered list of terms; a series is their sum. In an arithmetic progression (AP), the difference d between consecutive terms is constant. The nth term is a+(n−1)d and the sum of n terms is n/2[2a+(n−1)d] or n/2(a+l). In a geometric progression (GP), the common ratio r is constant; nth term is ar^(n−1), and finite sum for r≠1 is a(1−r^n)/(1−r). For |r|<1, the infinite GP sum is a/(1−r). Check whether the question asks for a term or a sum, and whether the first term is indexed as n=1. Financial growth and depreciation can often be modelled through geometric patterns.',
hinglish:'Sequence ordered terms, series unka sum. AP mein common difference d constant: nth term a+(n−1)d; sum n/2[2a+(n−1)d]. GP mein common ratio r constant: nth term ar^(n−1); finite sum a(1−r^n)/(1−r), r≠1. Infinite GP tabhi converge jab |r|<1; sum a/(1−r). Term aur sum ko confuse mat karo; first term n=1 hota hai.',
hindi:'Sequence terms की क्रमबद्ध सूची है; series उनका योग है। AP में common difference d स्थिर होता है: nth term a+(n−1)d और sum n/2[2a+(n−1)d]। GP में common ratio r स्थिर होता है: nth term ar^(n−1), finite sum a(1−r^n)/(1−r)। Infinite GP के लिए |r|<1 होना चाहिए और sum a/(1−r) है।'
},example:{
english:'AP 3, 7, 11, … has a=3 and d=4. Its 10th term is 3+9×4=39. Sum of first 10 terms is 10/2×(3+39)=210.',
hinglish:'AP 3,7,11,... mein a=3,d=4. 10th term 3+9×4=39. First 10 sum=5×(3+39)=210.',
hindi:'AP 3, 7, 11… में a=3 और d=4 है। 10वाँ term 39 और पहले 10 terms का sum 210 है।'
},simpler:{
english:'AP adds the same amount each time; GP multiplies by the same factor each time.',
hinglish:'AP mein har baar same number add; GP mein same ratio se multiply.',
hindi:'AP में हर बार समान संख्या जुड़ती है; GP में हर बार समान अनुपात से गुणा होता है।'
},quiz:{
english:'A machine loses 10% of its value each year. Identify the progression type and calculate its value after 3 years if initial value is ₹2,00,000.',
hinglish:'Machine har saal 10% value lose karti hai. Progression type identify karo aur ₹2,00,000 ki 3 years baad value nikaalo.',
hindi:'Machine हर वर्ष 10% value खोती है। Progression का प्रकार बताकर ₹2,00,000 की 3 वर्ष बाद value निकालें।'
}},
{chapterNumber:7,title:'Sets, Relations and Functions, Basics of Limits and Continuity functions',section:'Business Mathematics',aliases:['sets relations and functions','set theory','venn diagram','relations and functions','domain and range','limits and continuity','limit of a function','संग्रह संबंध फलन','समुच्चय','सीमा और सातत्य'],answer:{
english:'A set is a well-defined collection of distinct objects. Operations include union (A∪B), intersection (A∩B), difference and complement. De Morgan’s laws connect complements of unions and intersections. Venn diagrams help count elements and avoid double counting: n(A∪B)=n(A)+n(B)−n(A∩B). A relation is a subset of a Cartesian product; a function assigns exactly one output to each input in its domain. Domain is the permitted input set, codomain is the declared output set, and range is the outputs actually attained. A limit describes the value approached by a function as x approaches a point; it need not equal the function’s value at that point. Continuity at a point requires the function value and two-sided limit to exist and be equal. Always check one-sided limits and domain restrictions before using limit laws.',
hinglish:'Set distinct, well-defined objects ka collection hai. Union combine, intersection common, difference aur complement operations hain. Venn formula n(A∪B)=n(A)+n(B)−n(A∩B). Relation Cartesian product ka subset; function har domain input ko exactly one output deta hai. Domain input set, codomain declared output set, range actual outputs. Limit batata hai x kisi point ke paas jaane par function kis value ke paas jata hai; zaroori nahi f(point) same ho. Continuity ke liye left/right limit aur function value exist aur equal honi chahiye.',
hindi:'Set distinct तथा well-defined objects का collection है। Union, intersection, difference और complement मुख्य operations हैं। n(A∪B)=n(A)+n(B)−n(A∩B)। Function domain के प्रत्येक input को exactly एक output देता है। Domain input set, codomain घोषित output set और range actual outputs हैं। Limit बताता है कि x किसी point के पास जाने पर function किस value के पास जाता है। Continuity के लिए function value और two-sided limit मौजूद तथा समान होने चाहिए।'
},example:{
english:'If n(A)=20, n(B)=15 and n(A∩B)=5, then n(A∪B)=20+15−5=30. For f(x)=x², domain may be all real numbers and range is x≥0.',
hinglish:'n(A)=20,n(B)=15, intersection 5 toh union=30. f(x)=x² ka real domain all real numbers; range y≥0.',
hindi:'n(A)=20, n(B)=15 और intersection 5 है तो union 30 होगा। f(x)=x² का domain सभी real numbers और range y≥0 है।'
},simpler:{
english:'Sets organise collections. A function is a rule that gives one output for every allowed input. A limit describes approaching behaviour.',
hinglish:'Set collection hai. Function har valid input ka one output deta hai. Limit approaching behaviour batata hai.',
hindi:'Set collections को व्यवस्थित करता है। Function प्रत्येक valid input को एक output देता है। Limit approaching behaviour बताता है।'
},quiz:{
english:'In a group, 40 study Accounting, 25 study Law and 10 study both. Find how many study at least one subject and explain why 10 is subtracted.',
hinglish:'40 Accounting, 25 Law aur 10 dono padhte. At least one kitne? 10 subtract kyun?',
hindi:'40 Accounting, 25 Law और 10 दोनों पढ़ते हैं। कम-से-कम एक subject पढ़ने वालों की संख्या निकालें और 10 क्यों घटाया गया समझाएँ।'
}},
{chapterNumber:8,title:'Basic Applications of Differential and Integral Calculus in Business and Economics',section:'Business Mathematics',aliases:['differential and integral calculus','differentiation','derivatives','marginal cost','marginal revenue','maxima minima','integration','calculus in business','अवकलन समाकलन','सीमांत लागत'],answer:{
english:'Differential calculus studies rates of change. The derivative f′(x) is the instantaneous rate of change or slope of the curve. Basic rules include the power rule d(x^n)/dx=nx^(n−1), constant multiple rule, sum rule and product/quotient rules where needed. In business, marginal cost is the derivative of total cost with respect to output, and marginal revenue is the derivative of total revenue. A stationary point occurs where f′(x)=0; the second derivative can help classify a local maximum (f″<0) or minimum (f″>0), subject to domain and boundary checks. Integral calculus reverses differentiation and can accumulate a marginal function to recover a total function, with a constant of integration. A definite integral measures accumulated change over an interval. Interpret units and the economic meaning; a mathematical maximum outside feasible capacity is not a practical optimum.',
hinglish:'Differential calculus rate of change study karta hai. Derivative f′(x) curve ka slope/instantaneous rate hai. Power rule d(x^n)/dx=nx^(n−1), sum aur constant rules common hain. Business mein marginal cost = total cost ka output ke respect derivative; marginal revenue similar. Stationary point f′=0; second derivative negative ho toh local max, positive ho toh local min, but domain/boundary bhi check karo. Integral calculus derivative ka reverse; marginal function se total function recover kar sakta hai (constant include). Definite integral interval ka accumulated change hai. Units aur feasible range check karo.',
hindi:'Differential calculus rate of change का अध्ययन है। Derivative f′(x) instantaneous rate या curve का slope है। Power rule d(x^n)/dx=nx^(n−1) है। Business में marginal cost total cost का output के respect derivative है; marginal revenue भी इसी प्रकार। Stationary point पर f′(x)=0; f″ negative होने पर local maximum और positive होने पर local minimum हो सकता है, पर domain तथा boundary जाँचें। Integral calculus differentiation का reverse है और accumulated change बताता है।'
},example:{
english:'If total cost C=100+20q+q², marginal cost dC/dq=20+2q. At q=10, MC=₹40 per unit. The fixed cost 100 disappears on differentiation because its marginal change is zero.',
hinglish:'C=100+20q+q² toh MC=dC/dq=20+2q. q=10 par MC=40. Fixed cost derivative zero hota hai.',
hindi:'C=100+20q+q² है तो MC=20+2q। q=10 पर marginal cost 40 है। Fixed cost का derivative zero होता है।'
},simpler:{
english:'Differentiation tells how fast a value changes. Integration adds up small changes across a range.',
hinglish:'Differentiation change ki speed batata hai; integration range par changes add karta hai.',
hindi:'Differentiation change की rate बताता है; integration interval में changes जोड़ता है।'
},quiz:{
english:'Total revenue is R=100q−2q². Find marginal revenue and the output where marginal revenue becomes zero. Explain the domain limitation.',
hinglish:'R=100q−2q². MR nikaalo aur kis q par MR zero? Domain limitation bhi explain karo.',
hindi:'R=100q−2q² है। Marginal revenue और वह output निकालें जहाँ MR zero है। Domain limitation समझाएँ।'
}},
{chapterNumber:9,title:'Number Series, Coding and Decoding and Odd Man Out',section:'Logical Reasoning',aliases:['number series coding and decoding odd man out','number series','coding and decoding','odd man out','संख्या श्रृंखला','कोडिंग डिकोडिंग'],answer:{
english:'Logical reasoning identifies a rule that explains the relationship between items. In number series, test common differences, ratios, alternating patterns, squares/cubes, prime numbers, digit operations and combinations of two patterns. Coding-decoding questions may use letter positions, forward/backward shifts, reversal, substitution or a consistent transformation; verify the rule against every example rather than guessing from one pair. Odd-man-out problems require identifying the property shared by most items and the one that violates it. Work systematically: write positions, calculate differences, compare alternate terms, state the rule and test the next term. If several rules appear possible, choose the simplest rule consistent with all given terms and options.',
hinglish:'Logical reasoning pattern identify karta hai. Number series mein differences, ratios, alternate terms, squares/cubes, primes aur digit operations test karo. Coding-decoding mein letter position, shift, reverse ya substitution ho sakta hai—rule har pair par test karo. Odd man out mein common property identify karo aur jo violate kare use select karo. Guess nahi; positions/differences likho aur rule verify karo.',
hindi:'Logical reasoning में items के बीच rule पहचानते हैं। Number series में differences, ratios, alternate terms, squares/cubes, primes और digit operations जाँचें। Coding-decoding में letter positions, shifts, reversal या substitution हो सकता है। Odd man out में अधिकांश items की common property पहचानें और उससे अलग item चुनें। Rule सभी दिए गए terms पर verify करें।'
},example:{
english:'Series 2, 6, 12, 20, 30 has differences 4, 6, 8, 10; next difference 12 gives 42. The pattern is n(n+1): 1×2, 2×3, …, 6×7.',
hinglish:'2,6,12,20,30 differences 4,6,8,10; next +12 so 42. Pattern n(n+1).',
hindi:'2, 6, 12, 20, 30 में differences 4, 6, 8, 10 हैं; अगला +12, इसलिए 42।'
},simpler:{
english:'Look for what changes from one term to the next. Check the pattern with all terms before choosing the next one.',
hinglish:'Har term se next term mein kya change hua dekho; rule sab terms par verify karo.',
hindi:'एक term से अगले term में क्या बदलाव है देखें और rule सभी terms पर जाँचें।'
},quiz:{
english:'Find the next term: 3, 8, 15, 24, 35, __. Explain the pattern.',
hinglish:'3,8,15,24,35 ke baad next term? Pattern explain karo.',
hindi:'3, 8, 15, 24, 35 के बाद अगला term निकालें और pattern समझाएँ।'
}},
{chapterNumber:10,title:'Direction Sense Test',section:'Logical Reasoning',aliases:['direction sense test','direction sense','directions reasoning','north south east west','दिशा परीक्षण','दिशा ज्ञान'],answer:{
english:'Direction questions track a person’s position and orientation after a sequence of movements or turns. Fix a consistent reference: north is upward, east right, south downward and west left on the page. A right turn is clockwise relative to the person’s current facing direction; a left turn is anticlockwise. Do not confuse the person’s left/right with the page’s left/right after the person turns. Draw a small route diagram, label each segment and calculate net horizontal and vertical displacement. The shortest distance from start to finish may require the Pythagorean theorem when movements form a right angle. State the final direction from the starting point and the person’s final facing direction separately.',
hinglish:'Direction questions mein current position aur facing direction track karo. North up, east right, south down, west left fix rakho. Right turn person ke current facing se clockwise; left anticlockwise. Turn ke baad page ka left/right aur person ka left/right confuse mat karo. Route diagram banao, net horizontal/vertical displacement nikaalo. Shortest distance right angle bane toh Pythagoras use karo. Final location direction aur final facing alag state karo.',
hindi:'Direction questions में position और facing direction track करें। North ऊपर, East दाएँ, South नीचे और West बाएँ रखें। Right turn व्यक्ति की current दिशा से clockwise और left turn anticlockwise होता है। Diagram बनाकर horizontal तथा vertical displacement निकालें। Shortest distance में right-angle बने तो Pythagoras theorem उपयोग करें। Final location और final facing direction अलग रखें।'
},example:{
english:'A person walks 3 km north and then 4 km east. The final position is north-east of the start and the shortest distance is √(3²+4²)=5 km.',
hinglish:'3 km north, phir 4 km east: final position north-east; shortest distance √(9+16)=5 km.',
hindi:'3 km उत्तर और 4 km पूर्व चलने पर व्यक्ति start से उत्तर-पूर्व में होगा और shortest distance 5 km है।'
},simpler:{
english:'Draw the route. Track the person’s facing direction after each turn, then compare the final point with the start.',
hinglish:'Route draw karo. Har turn ke baad facing direction track karo, phir start se final point compare karo.',
hindi:'Route बनाएँ, हर turn के बाद facing direction track करें और start से final point compare करें।'
},quiz:{
english:'A person faces east, turns left, walks 5 km, turns right, walks 3 km and turns right again. What direction are they facing and where are they relative to the start?',
hinglish:'Person east face karta hai, left turn 5 km, right turn 3 km, phir right turn. Ab kis direction mein face aur start ke relative kahan?',
hindi:'व्यक्ति East की ओर है, left turn लेकर 5 km, right turn लेकर 3 km और फिर right turn करता है। अब facing direction और start के सापेक्ष position बताइए।'
}},
{chapterNumber:11,title:'Seating Arrangements',section:'Logical Reasoning',aliases:['seating arrangements','linear seating arrangement','circular seating arrangement','seating puzzle','बैठने की व्यवस्था','वृत्ताकार बैठक'],answer:{
english:'Seating-arrangement problems place people or objects in a line or circle under conditions such as left/right, next to, between, opposite and facing direction. For a linear arrangement, fix the reference orientation (all face north, for example) and translate left/right consistently. For a circular arrangement, clarify whether people face the centre or outside because left/right reverses. Start with the strongest constraints: fixed positions, immediate neighbours, opposite pairs and negative restrictions. Use a table or diagram, mark uncertain positions with alternatives and eliminate contradictions. Do not assume that “between” means immediately between unless the question states immediate. For circular arrangements, rotationally equivalent positions are usually the same arrangement, while mirror images may or may not be equivalent depending on the problem.',
hinglish:'Seating puzzle line ya circle mein persons place karta hai based on left/right, next to, between, opposite, facing. Linear mein facing orientation fix karo. Circular mein centre/outside face kar rahe hain clarify karo kyunki left-right reverse hota hai. Strong clues pehle: fixed place, immediate neighbour, opposite, negative condition. Diagram banao, alternatives mark aur contradiction eliminate karo. “Between” hamesha immediate nahi hota unless stated.',
hindi:'Seating arrangement में line या circle में व्यक्तियों को left/right, neighbour, between, opposite और facing conditions के अनुसार रखा जाता है। Linear में facing orientation तय करें। Circular में centre या बाहर की ओर face करने से left/right बदलता है। Fixed positions, immediate neighbours और opposite clues पहले लगाएँ। Diagram बनाकर alternatives तथा contradictions जाँचें।'
},example:{
english:'In a row facing north, if A is immediately left of B, A appears on the page’s left of B. In a circle facing centre, the person’s left is clockwise from their seat position, so translate the clue based on facing.',
hinglish:'North face row mein A, B ke immediately left ho toh page par B ke left. Circle centre-facing mein person ka left clockwise hota hai; facing ke hisaab se map karo.',
hindi:'North-facing row में A, B के immediate left होगा तो page पर भी बाएँ। Centre-facing circle में व्यक्ति का left clockwise होता है।'
},simpler:{
english:'Draw the seats first, fix who faces where, and place the most certain clues before the uncertain ones.',
hinglish:'Seats draw karo, facing fix karo, sabse certain clues pehle place karo.',
hindi:'पहले seats बनाएँ, facing तय करें और सबसे निश्चित clues पहले रखें।'
},quiz:{
english:'Six people sit in a circle facing the centre. A is second to the left of B and C is opposite A. Explain which way “left” is measured and how you would begin the arrangement.',
hinglish:'6 log circle mein centre face karte. A, B ke second left aur C, A ke opposite. Left kis direction se measure hoga aur arrangement kaise start?',
hindi:'6 व्यक्ति centre की ओर मुख करके circle में बैठे हैं। A, B के second left और C, A के opposite है। Left कैसे मापेंगे और arrangement कैसे शुरू करेंगे?'
}},
{chapterNumber:12,title:'Blood Relations',section:'Logical Reasoning',aliases:['blood relations','family tree reasoning','family relationship test','रक्त संबंध','पारिवारिक संबंध'],answer:{
english:'Blood-relation reasoning identifies family links from statements. Translate each statement into a family tree rather than solving from memory. Use symbols or initials for male/female only when the question establishes them; do not infer gender from names. Distinguish paternal and maternal relations, generations, siblings, in-laws and step/adoptive relationships if stated. Start from the person whose relation is asked, trace one link at a time and check the direction: “A is the mother of B” is not the same as “B is the mother of A”. If a pronoun is ambiguous, use the exact sentence order and answer options. Draw separate branches for spouses and children to avoid assuming siblings share both parents unless stated.',
hinglish:'Blood relation statements ko family tree mein convert karo. Gender tabhi assume karo jab question bataye; naam se infer mat karo. Paternal/maternal, generation, sibling, in-law alag rakho. Asked person se start, one link at a time trace karo; A mother of B ≠ B mother of A. Ambiguous pronoun ho toh exact wording/option check karo. Parents same hain assume mat karo unless stated.',
hindi:'Blood relation questions में statements को family tree में बदलें। Gender केवल question से मिले तो मानें, नाम से नहीं। Paternal/maternal, generation, siblings और in-laws अलग रखें। पूछे गए व्यक्ति से शुरू करके एक-एक link trace करें। A, B की mother है और B, A की mother है—दोनों अलग हैं।'
},example:{
english:'“P is the brother of Q; Q is the mother of R.” P is R’s maternal uncle. The relation follows the chain P→Q→R and Q is R’s mother.',
hinglish:'P, Q ka brother; Q, R ki mother. P, R ka maternal uncle. Chain clearly trace karo.',
hindi:'P, Q का भाई है और Q, R की mother है। इसलिए P, R का maternal uncle है।'
},simpler:{
english:'Draw a small family tree and follow each sentence in order. Never reverse who is related to whom.',
hinglish:'Chhota family tree banao aur statements order mein follow karo; relation reverse mat karo.',
hindi:'छोटा family tree बनाएँ और statements क्रम से follow करें।'
},quiz:{
english:'M is the sister of N. N is the father of T. How is M related to T? Explain the chain.',
hinglish:'M, N ki sister hai; N, T ka father hai. M ka T se relation?',
hindi:'M, N की sister है और N, T का father है। M का T से क्या relation है?'
}},
{chapterNumber:13,title:'Statistical Description of Data',section:'Statistics',units:['Unit II: Sampling'],aliases:['statistical description of data','sampling','data classification','frequency distribution','tabulation','bar diagram','histogram','ogive','समंकों का सांख्यिकीय वर्णन','नमूनाकरण'],answer:{
english:'Statistics organises data so that patterns can be described and decisions informed. Data may be qualitative or quantitative, discrete or continuous, primary or secondary. Classification groups observations by a relevant characteristic; tabulation arranges them in rows and columns. A frequency distribution records the number of observations in each class. Class intervals should be clear, non-overlapping and cover the observations. Bar diagrams compare categories with separated bars; histograms represent continuous grouped data with touching rectangles, and when class widths differ the area—not merely height—must represent frequency. Frequency polygons and ogives show distribution shape and cumulative frequency. Sampling selects part of a population to learn about the whole; probability sampling gives known selection chances, while non-probability methods do not. A sample should be representative, sufficiently large for its purpose and selected without avoidable bias. Distinguish a statistic (sample measure) from a parameter (population measure).',
hinglish:'Statistics data ko organise karke pattern aur decisions mein help karta hai. Data qualitative/quantitative, discrete/continuous, primary/secondary ho sakta hai. Classification grouping; tabulation rows/columns; frequency distribution class-wise counts. Class intervals clear aur non-overlap hon. Bar diagram categories compare; histogram continuous data ke liye touching bars. Different class widths par area frequency represent karta hai. Sampling population ka part select karke whole par inference karta hai. Probability sample mein known selection chance; non-probability mein nahi. Bias avoid karo; sample representative ho. Statistic sample measure, parameter population measure.',
hindi:'Statistics data को organise कर patterns दिखाता है। Data qualitative/quantitative, discrete/continuous तथा primary/secondary हो सकता है। Classification observations को group करता है; tabulation rows/columns में रखता है; frequency distribution class-wise counts देता है। Histogram continuous data के लिए touching bars बनाता है; अलग class widths में area frequency दर्शाता है। Sampling population के हिस्से से पूरी population पर inference करता है। Probability sampling में selection chances ज्ञात होते हैं; sample representative होना चाहिए।'
},example:{
english:'Marks grouped as 0–10, 10–20, 20–30 have frequency counts 4, 9 and 7. A histogram uses adjacent bars because marks are treated as continuous grouped intervals.',
hinglish:'Marks classes 0–10,10–20,20–30 ki frequencies 4,9,7 hain. Histogram mein bars touch karengi kyunki grouped continuous intervals hain.',
hindi:'0–10, 10–20, 20–30 classes की frequencies 4, 9, 7 हैं। Continuous grouped data होने से histogram bars जुड़ी होंगी।'
},simpler:{
english:'Classification organises data, frequency counts observations, charts show patterns and sampling selects a subset to study a population.',
hinglish:'Classification data group karta, frequency count, chart pattern dikhata aur sampling subset select karta hai.',
hindi:'Classification data को group करता है, frequency count करती है, chart pattern दिखाता है और sampling subset चुनती है।'
},quiz:{
english:'A survey selects only customers who visit one premium store. Explain why the sample may be biased when estimating preferences of all customers.',
hinglish:'Survey sirf premium store aane wale customers select karta hai. All customers ke preference estimate mein bias kyun hoga?',
hindi:'Survey केवल premium store आने वाले customers चुनता है। सभी customers की preferences का अनुमान biased क्यों होगा?'
}},
{chapterNumber:14,title:'Measures of Central Tendency and Dispersion',section:'Statistics',aliases:['measures of central tendency and dispersion','mean median mode','arithmetic mean','weighted mean','quartiles','standard deviation','variance','coefficient of variation','केंद्रीय प्रवृत्ति','विक्षेपण'],answer:{
english:'Measures of central tendency describe a typical or central value. Arithmetic mean is total of observations divided by number of observations; weighted mean gives different weights to observations. Median is the middle value after arranging data; mode is the most frequent value. The median is less affected by extreme values, while the mean uses all observations and is algebraically useful. Dispersion describes spread: range is maximum minus minimum; quartile deviation uses Q3−Q1; variance is the average squared deviation under the specified denominator convention; standard deviation is its square root. Coefficient of variation (CV)=standard deviation/mean×100 and is useful for comparing relative variability when means are positive and units differ. Choose measures according to data type, skewness and purpose. Check whether a question treats data as a population or sample before choosing the denominator.',
hinglish:'Central tendency typical value batata hai. Mean = total/n; weighted mean weights use karta. Median sorted data ka middle; mode most frequent. Median extremes se less affected; mean all observations use karta. Dispersion spread batata: range=max−min; quartile deviation; variance squared deviations; SD square root. CV=SD/mean×100 relative variability compare karta, jab mean positive ho. Population vs sample denominator question se identify karo.',
hindi:'Central tendency typical value बताती है। Mean = observations का sum/n; weighted mean में weights होते हैं। Median arranged data का middle और mode सबसे frequent value है। Median extreme values से कम प्रभावित होती है। Dispersion spread बताता है: range=max−min, variance squared deviations और SD उसका square root है। CV=SD/mean×100 relative variability compare करता है। Population या sample denominator की जाँच करें।'
},example:{
english:'For 2, 4, 6, 8, 10, mean=6 and median=6. Range=10−2=8. If one observation changes to 100, the mean rises sharply while the median is less affected.',
hinglish:'2,4,6,8,10 ka mean=6, median=6, range=8. Ek value 100 ho jaaye toh mean sharply change, median comparatively stable.',
hindi:'2, 4, 6, 8, 10 का mean और median 6 हैं तथा range 8 है। एक observation 100 हो जाए तो mean अधिक प्रभावित होगा।'
},simpler:{
english:'Central tendency tells the centre; dispersion tells how spread out the observations are.',
hinglish:'Central tendency centre batati hai; dispersion data kitna spread hai.',
hindi:'Central tendency centre और dispersion spread बताता है।'
},quiz:{
english:'Two investment options have the same average return but different standard deviations. Explain which one has greater variability and how CV can support comparison.',
hinglish:'Do investments ka average return same, SD different. Higher variability kiski aur CV kaise help karega?',
hindi:'दो investments का average return समान है लेकिन SD अलग है। किसकी variability अधिक है और CV comparison में कैसे मदद करेगा?'
}},
{chapterNumber:15,title:'Probability',section:'Statistics',aliases:['probability','addition theorem','multiplication theorem','conditional probability','independent events','mutually exclusive events','सांख्यिकीय प्रायिकता','प्रायिकता'],answer:{
english:'Probability measures the likelihood of an event on a scale from 0 to 1. For equally likely outcomes, P(A)=favourable outcomes/total outcomes. The complement rule is P(A′)=1−P(A). Addition rule: P(A∪B)=P(A)+P(B)−P(A∩B); for mutually exclusive events the intersection is zero. Multiplication rule: P(A∩B)=P(A)P(B|A); for independent events this becomes P(A)P(B). Conditional probability updates the chance of A when B is known: P(A|B)=P(A∩B)/P(B), with P(B)>0. Distinguish independent events from mutually exclusive events: independent events do not change each other’s probabilities, while mutually exclusive events cannot occur together. Draw a sample space or tree diagram where useful and verify that probabilities remain between zero and one.',
hinglish:'Probability likelihood 0 se 1 tak. Equally likely outcomes: favourable/total. Complement 1−P(A). Addition P(A∪B)=P(A)+P(B)−P(A∩B); mutually exclusive mein intersection zero. Multiplication P(A∩B)=P(A)P(B|A); independent mein P(A)P(B). Conditional P(A|B)=P(A∩B)/P(B). Independent aur mutually exclusive same nahi: independent mein probability effect nahi, mutually exclusive saath occur nahi karte.',
hindi:'Probability किसी event की likelihood 0 से 1 तक बताती है। Equally likely outcomes में P(A)=favourable/total। Complement 1−P(A)। Addition rule में intersection घटता है; mutually exclusive में intersection zero है। Multiplication rule P(A∩B)=P(A)P(B|A); independent events में P(A)P(B)। Conditional probability P(A|B)=P(A∩B)/P(B)। Independent और mutually exclusive अलग concepts हैं।'
},example:{
english:'A fair die is thrown. Probability of an even number is 3/6=1/2. Probability of not getting an even number is 1−1/2=1/2.',
hinglish:'Fair die par even number ki probability 3/6=1/2. Even nahi aane ki probability complement 1/2.',
hindi:'Fair die पर even number की probability 3/6=1/2 है। Even न आने की probability भी 1/2 है।'
},simpler:{
english:'Probability counts how likely an event is. Use complement, addition or multiplication according to how events relate.',
hinglish:'Probability chance batati hai; events ka relation dekhkar complement/addition/multiplication use karo.',
hindi:'Probability chance बताती है। Events के relation के अनुसार complement, addition या multiplication चुनें।'
},quiz:{
english:'A card is drawn from a standard deck. Find the probability that it is a king or a heart, explaining the overlap.',
hinglish:'Standard deck se card draw. King ya heart ki probability nikaalo; overlap explain karo.',
hindi:'Standard deck से card निकाला जाता है। King या heart होने की probability निकालें और overlap समझाएँ।'
}},
{chapterNumber:16,title:'Theoretical Distributions',section:'Statistics',aliases:['theoretical distributions','binomial distribution','poisson distribution','normal distribution','probability distribution','द्विपद वितरण','प्वासों वितरण','सामान्य वितरण'],answer:{
english:'A theoretical probability distribution models the probabilities of possible values of a random variable. A binomial distribution applies to a fixed number n of independent trials, each with two outcomes and constant success probability p; P(X=x)=nCx p^x(1−p)^(n−x), with mean np and variance np(1−p). Poisson distribution models counts of events in a fixed interval under a constant average rate and suitable independence assumptions; P(X=x)=e^(−λ)λ^x/x!, with mean and variance λ. The normal distribution is continuous, symmetric and bell-shaped, described by mean μ and standard deviation σ; standardisation z=(x−μ)/σ uses the standard normal table. Check assumptions before choosing a distribution. A binomial model is not appropriate merely because data are counts; the fixed-trial/two-outcome conditions matter.',
hinglish:'Distribution random variable values ki probabilities model karta hai. Binomial: fixed n independent trials, two outcomes, constant p; P(X=x)=nCx p^x(1−p)^(n−x), mean np, variance np(1−p). Poisson fixed interval mein constant average rate se events count; P=e^(−λ)λ^x/x!, mean/variance λ. Normal continuous, symmetric bell curve, mean μ aur SD σ; z=(x−μ)/σ. Model choose karne se pehle assumptions verify karo.',
hindi:'Theoretical distribution random variable के सम्भव values की probabilities model करता है। Binomial में fixed n independent trials, दो outcomes और constant p होता है। Mean np और variance np(1−p)। Poisson fixed interval में constant average rate से events count करता है; mean तथा variance λ। Normal distribution continuous, symmetric और bell-shaped होती है; z=(x−μ)/σ। Distribution चुनने से पहले assumptions जाँचें।'
},example:{
english:'A fair coin is tossed 4 times. The probability of exactly 2 heads is 4C2(0.5)^2(0.5)^2=6/16=3/8.',
hinglish:'Fair coin 4 toss; exactly 2 heads: 4C2×0.5^4=6/16=3/8.',
hindi:'Fair coin को 4 बार toss करने पर exactly 2 heads की probability 3/8 है।'
},simpler:{
english:'Binomial counts successes in fixed trials, Poisson counts events in an interval, and normal models continuous bell-shaped variation.',
hinglish:'Binomial fixed trials success count; Poisson interval events; normal continuous bell curve.',
hindi:'Binomial fixed trials में successes, Poisson interval में events और Normal continuous bell-shaped variation model करता है।'
},quiz:{
english:'A call centre receives an average of 3 calls per minute. Which distribution may model the number of calls in a minute, and what assumptions should be checked?',
hinglish:'Call centre ko average 3 calls/minute milte. Ek minute mein calls count ke liye kaunsi distribution aur assumptions?',
hindi:'Call centre में औसतन 3 calls प्रति minute आती हैं। एक minute में calls की संख्या के लिए कौन-सी distribution उपयुक्त हो सकती है और कौन-सी assumptions जाँचें?'
}},
{chapterNumber:17,title:'Correlation and Regression',section:'Statistics',aliases:['correlation and regression','correlation coefficient','pearson correlation','regression line','regression equations','rank correlation','सहसंबंध और प्रतिगमन'],answer:{
english:'Correlation measures the strength and direction of association between two variables. Pearson’s correlation coefficient r lies between −1 and +1: positive values indicate positive association, negative values inverse association, and values near zero little linear association. Correlation does not prove causation; a third factor, coincidence or reverse direction may explain the relationship. Regression estimates a relationship and predicts one variable from another using a fitted equation. In simple linear regression, ŷ=a+bx, where b is the slope and a the intercept. The least-squares line minimises the sum of squared residuals. Interpret the slope in units: expected change in y for one-unit change in x. Do not extrapolate far beyond the observed range without caution. Outliers, non-linearity, changing variance and poor data quality can distort interpretation.',
hinglish:'Correlation two variables ka strength/direction measure karta hai. Pearson r −1 to +1: positive direct association, negative inverse, zero ke paas weak linear association. Correlation causation prove nahi karta. Regression one variable ko another se estimate/predict karta hai; line ŷ=a+bx. Slope b = x ke one-unit change par y ka expected change. Observed range se bahar prediction cautious. Outliers, nonlinear relation aur poor data result distort karte hain.',
hindi:'Correlation दो variables के association की strength तथा direction बताता है। Pearson r −1 से +1 तक होता है। Positive direct और negative inverse association दर्शाता है; zero के पास weak linear association। Correlation causation सिद्ध नहीं करता। Regression fitted equation से एक variable का अनुमान लगाता है: ŷ=a+bx। Slope x में एक unit change पर y का expected change बताता है। Outliers और non-linearity results को प्रभावित कर सकते हैं।'
},example:{
english:'If a regression line is ŷ=20+3x, then for x=5 the predicted y is 35. The slope 3 means predicted y rises by 3 units for each one-unit rise in x within the model context.',
hinglish:'Regression ŷ=20+3x; x=5 par y=35. Slope 3 ka matlab x one unit badhe toh predicted y 3 unit badhe.',
hindi:'Regression line ŷ=20+3x में x=5 पर predicted y=35 है। Slope 3 दर्शाता है कि x एक unit बढ़ने पर y का अनुमान 3 units बढ़ता है।'
},simpler:{
english:'Correlation tells whether variables move together. Regression gives an equation to estimate one variable from another.',
hinglish:'Correlation batata variables saath move karte ya nahi; regression estimate equation deta hai.',
hindi:'Correlation बताता है variables साथ बदलते हैं या नहीं; regression estimate करने का equation देता है।'
},quiz:{
english:'Advertising spend and sales are positively correlated. Explain why this alone does not prove advertising caused the increase in sales.',
hinglish:'Advertising aur sales positively correlated hain. Ye causation prove kyun nahi karta?',
hindi:'Advertising और sales positively correlated हैं। केवल इससे advertising को sales वृद्धि का कारण क्यों नहीं मान सकते?'
}},
{chapterNumber:18,title:'Index Numbers',section:'Statistics',aliases:['index numbers','price index','consumer price index','laspeyres index','paasche index','fisher index','cost of living index','सूचकांक','मूल्य सूचकांक'],answer:{
english:'Index numbers measure relative change in a variable or group of variables over time, often using a base period set to 100. A simple price relative is current price/base price×100. Weighted indices recognise that items have different importance. Laspeyres price index uses base-period quantities as weights; Paasche uses current-period quantities; Fisher’s Ideal Index is the geometric mean of Laspeyres and Paasche. A consumer price or cost-of-living index tracks price changes for a representative basket, subject to basket weights and methodology. Check the base year, item selection, weights, quality changes, missing prices and formula. Index numbers are designed comparisons, not exact measures of every individual’s experience. A change from 120 to 132 represents a 10% increase relative to the earlier index, not 132% inflation.',
hinglish:'Index number time ke saath relative change measure karta hai; base period often 100. Price relative=current/base×100. Weighted index items ki importance consider karta. Laspeyres base quantities weights; Paasche current quantities; Fisher un dono ka geometric mean. CPI representative basket aur weights track karta. Base year, weights, quality change, formula check karo. Index 120 se 132 ho toh 10% increase, 132% nahi.',
hindi:'Index numbers समय के साथ relative change मापते हैं; base period अक्सर 100 रखा जाता है। Price relative=current price/base price×100। Weighted index अलग-अलग items की importance को मानता है। Laspeyres base-period quantities, Paasche current-period quantities और Fisher दोनों का geometric mean उपयोग करता है। Base year, weights और methodology जाँचें। Index 120 से 132 होने का अर्थ 10% वृद्धि है, 132% inflation नहीं।'
},example:{
english:'A price index rises from 120 to 132. Percentage rise=(132−120)/120×100=10%. The base-year level of 100 is not the denominator for this period-to-period percentage change.',
hinglish:'Index 120 se 132: rise=(12/120)×100=10%. Period-to-period change mein 120 denominator hai, base 100 nahi.',
hindi:'Index 120 से 132 हुआ; वृद्धि=(12/120)×100=10% है। Period-to-period change में 120 denominator होगा।'
},simpler:{
english:'An index compares a basket or variable with a base period. Read the base, weights and percentage change carefully.',
hinglish:'Index base period se comparison hai. Base year, weights aur change ka denominator check karo.',
hindi:'Index base period से comparison है। Base year, weights और percentage change का आधार जाँचें।'
},quiz:{
english:'A cost index rises from 150 to 165. Calculate the percentage increase and explain why the answer is not 15%.',
hinglish:'Cost index 150 se 165. Percentage increase nikaalo aur 15% kyun nahi?',
hindi:'Cost index 150 से 165 हुआ। Percentage increase निकालें और यह 15% क्यों नहीं है, समझाएँ।'
}}
];

export const PARAKH_FOUNDATION_QA_BENCHMARKS=CHAPTERS.flatMap(chapter=>{
 const families=[
  ['core_concept','Explain the central concepts and rules in '+chapter.title+'.'],
  ['unseen_numerical_application','Solve an unseen Foundation-level application on '+chapter.title+' with clear workings.'],
  ['exam_style_presentation','Prepare a structured Foundation exam-style explanation for '+chapter.title+'.'],
  ['edge_case_and_common_error','Identify an assumption, edge case or common error in '+chapter.title+'.'],
  ['attempt_source_sensitivity','Confirm the applicable chapter treatment and exact attempt edition for '+chapter.title+'.']
 ] as const;
 return families.map(([family,question],index)=>({id:'foundation-qa-chapter-'+chapter.chapterNumber+'-'+(index+1),chapterNumber:chapter.chapterNumber,family,question}));
});

export type ParakhFoundationQaMatch={topicId:string;topicTitle:string;course:'CA_FOUNDATION';paperCode:'FND-P3';section:'Quantitative Aptitude';chapterNumber:number;syllabusApplicability:string;contentReviewStatus:'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED';benchmarkStatus:'PROMPTS_DEFINED_NOT_EVALUATED';mode:ParakhFoundationQaMode;answer:string;source:{title:string;url:string}};

function normalize(value:string):string{return String(value||'').toLocaleLowerCase('en-IN').normalize('NFKC').replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function modeOf(message:string):ParakhFoundationQaMode{
 if(/\b(quiz|test me|ask me|practice question)\b|प्रश्नोत्तरी|टेस्ट लो|सवाल पूछो/i.test(message))return'quiz';
 if(/\b(example|illustrate|case study|for example)\b|उदाहरण|मिसाल/i.test(message))return'example';
 if(/\b(simple|simpler|easy language|in simple words)\b|आसान भाषा|सरल भाषा/i.test(message))return'simpler';
 return'answer';
}
function attemptSensitive(message:string):boolean{
 return /\b(latest|most recent|corrigendum|applicable for|upcoming attempt|my attempt|exact syllabus|new syllabus|may 2027|current exam pattern)\b/i.test(message);
}
export function searchParakhFoundationQuantitativeAptitudeKnowledge(input:{message:string;course:string;language:ParakhFoundationQaLanguage}):ParakhFoundationQaMatch|null{
 const message=String(input.message||'').trim();
 if(!message||input.course!=='CA_FOUNDATION'||attemptSensitive(message))return null;
 const text=' '+normalize(message)+' ';
 const chapter=CHAPTERS.find(item=>item.aliases.some(alias=>{const term=normalize(alias);return term&&text.includes(' '+term+' ');}));
 if(!chapter)return null;
 const mode=modeOf(message);
 return {topicId:'foundation-qa-chapter-'+chapter.chapterNumber,topicTitle:chapter.title,course:'CA_FOUNDATION',paperCode:'FND-P3',section:'Quantitative Aptitude',chapterNumber:chapter.chapterNumber,syllabusApplicability:PARAKH_FOUNDATION_QA_APPLICABILITY,contentReviewStatus:'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED',benchmarkStatus:'PROMPTS_DEFINED_NOT_EVALUATED',mode,answer:chapter[mode][input.language],source:{title:'ICAI Foundation Paper 3: Quantitative Aptitude — relevant for May 2027 and onwards',url:PARAKH_FOUNDATION_QA_SOURCE_URL}};
}
export function buildParakhFoundationQuantitativeAptitudeReply(result:ParakhFoundationQaMatch,language:ParakhFoundationQaLanguage):string{
 const heading=language==='hindi'?'अध्याय':'Chapter';
 const source=language==='hinglish'?'\n\n**Syllabus source:** ICAI Paper 3 page is material ko May 2027 aur onwards ke liye relevant batati hai. Exact attempt edition check karo.':language==='hindi'?'\n\n**पाठ्यक्रम स्रोत:** ICAI Paper 3 page इस material को May 2027 और onwards के लिए relevant बताती है। Exact attempt edition जाँचें.':'\n\n**Syllabus source:** ICAI Paper 3 material is marked relevant for May 2027 and onwards. Check the exact attempt edition.';
 const review=language==='hinglish'?'\n\n**Content status:** Original PARAKH draft hai; qualified mathematics/statistics academic reviewer ne verify nahi kiya. Numerical working ko question ke exact data se check karo.':language==='hindi'?'\n\n**Content status:** यह original PARAKH draft है; qualified reviewer ने verify नहीं किया है। Numerical working को question के exact data से जाँचें.':'\n\n**Content status:** Original PARAKH draft; not yet verified by a qualified mathematics/statistics academic reviewer. Check numerical workings against the exact question.';
 return '**'+heading+' '+result.chapterNumber+': '+result.topicTitle+'**\n\n'+result.answer+source+review;
}
export function getParakhFoundationQuantitativeAptitudeInventory(){
 return {course:'CA_FOUNDATION' as const,paperCode:'FND-P3' as const,paperTitle:'Quantitative Aptitude',sourceCheckedAt:'2026-11-08',sourceUrl:PARAKH_FOUNDATION_QA_SOURCE_URL,syllabusApplicability:PARAKH_FOUNDATION_QA_APPLICABILITY,chapterCount:CHAPTERS.length,authoredContentCount:CHAPTERS.length,humanReviewedContentCount:0 as const,benchmarkCaseCount:PARAKH_FOUNDATION_QA_BENCHMARKS.length,humanReviewedBenchmarkCount:0 as const,chapters:CHAPTERS.map(chapter=>({chapterNumber:chapter.chapterNumber,title:chapter.title,module:chapter.section,units:chapter.units || [],contentStatus:'AUTHOR_DRAFT_NOT_HUMAN_VERIFIED' as const,benchmarkStatus:'PROMPTS_DEFINED_NOT_EVALUATED' as const})),limitations:['Official ICAI page marks the material Relevant for May 2027 and Onwards Examination; confirm exact attempt and corrigendum.','Eighteen original chapter drafts exist in English, Hindi and Hinglish; none is human-reviewed.','Ninety benchmark prompts are defined but have no approved answer keys and have not been evaluated.','These are original notes, worked illustrations and reasoning approaches; they do not reproduce ICAI study material.']};
}
