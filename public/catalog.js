export const rules = [
{id:'R1',title:'Rigid plastic',category:'Dry recycling',text:'Empty rigid plastic bottles, tubs and lids go in dry recycling. Rinse away food or drink residue and let them dry. Separate lids from containers.'},
{id:'R2',title:'Paper and cardboard',category:'Dry recycling',text:'Clean, dry paper and cardboard go in dry recycling. Flatten boxes. Tear off greasy or food-soiled sections and put those sections in general waste.'},
{id:'R3',title:'Metal packaging',category:'Dry recycling',text:'Empty aluminium drink cans and steel food tins go in dry recycling. Rinse away residue and let them dry.'},
{id:'R4',title:'Glass containers',category:'Glass collection',text:'Empty glass bottles and jars go to the campus glass collection point. Rinse containers and separate lids; metal lids go in dry recycling. Broken glass is not accepted at this point; contact campus facilities for handling instructions.'},
{id:'R5',title:'Food scraps',category:'Food waste',text:'Fruit and vegetable scraps, banana peels, eggshells and loose tea leaves go in the food-waste bin. Remove all packaging first.'},
{id:'R6',title:'Mixed and flexible packaging',category:'General waste',text:'Plastic-lined paper cups, multilayer snack wrappers, flexible plastic bags and drink cartons go in general waste under this sample campus scheme. Empty remaining contents first. Separate rigid plastic lids and put them in dry recycling after rinsing and drying.'},
{id:'R7',title:'Soiled paper',category:'General waste',text:'Used tissues, napkins and greasy cardboard go in general waste. Clean cardboard sections may be separated, flattened and placed in dry recycling.'},
{id:'R8',title:'Batteries and electronics',category:'Special collection',text:'Batteries, light bulbs and small electronic devices must not go in campus bins. Take them to the staffed special-waste desk for collection.'}
];
export const items = [
['Plastic bottle','Rigid plastic','R1','bottle plastic water bottle pet bottle'],['Yogurt tub','Rigid plastic','R1','yogurt yoghurt tub'],['Plastic lid','Rigid plastic','R1','plastic lid'],['Cardboard box','Cardboard','R2','cardboard box parcel'],['Newspaper','Paper','R2','newspaper paper sheet'],['Pizza box','Cardboard; condition needs confirmation','R2','pizza'],['Drink can','Aluminium','R3','can soda aluminium aluminum'],['Food tin','Steel','R3','tin steel'],['Glass jar','Glass','R4','glass jar'],['Glass bottle','Glass','R4','glass bottle'],['Banana peel','Organic food waste','R5','banana'],['Vegetable scraps','Organic food waste','R5','vegetable scraps potato carrot'],['Eggshells','Organic food waste','R5','egg eggshell'],['Tea leaves','Organic food waste','R5','tea leaves'],['Coffee cup','Plastic-lined paper + optional rigid plastic lid','R6','coffee cup takeaway cup paper cup'],['Snack wrapper','Multilayer packaging','R6','wrapper chips crisp snack'],['Plastic bag','Flexible plastic','R6','plastic bag carrier bag'],['Drink carton','Mixed-material carton','R6','carton tetra milk juice'],['Used tissue','Soiled paper','R7','tissue napkin'],['Battery','Battery / special waste','R8','battery batteries']
].concat([
['Orange peel','Organic fruit scraps','R5','orange peel citrus peel'],
['Paper bag','Paper; confirm clean and unlined','R2','paper bag'],
['Cardboard egg carton','Cardboard','R2','cardboard egg carton'],
['Rigid plastic container','Rigid plastic','R1','rigid plastic container tub'],
['Plastic bottle cap','Rigid plastic','R1','plastic bottle cap']
]).map(([name,material,rule,keywords])=>({name,material,rule,keywords}));
// Recognition vocabulary is distinct from training data and from collection policy.
const additions = [
['Food scraps','Organic fruit and vegetable scraps','R5',`Apple core|Potato peel|Carrot peel|Onion skin|Garlic skin|Cucumber peel|Watermelon rind|Mango peel|Papaya peel|Pineapple skin|Avocado peel|Fruit seeds|Corn cob|Cabbage leaves|Lettuce scraps|Tomato scraps|Broccoli stalk|Pea pods|Coconut flesh|Lemon peel`],
['Paper and cardboard','Clean, dry, uncoated paper or cardboard','R2',`Clean office paper|Clean notebook paper|Clean envelope|Clean brown wrapping paper|Clean paper shopping bag|Cereal box|Shoe box|Delivery box|Toilet roll tube|Kitchen roll tube|Clean cardboard sleeve|Clean paper packaging|Clean cardboard tray|Clean paper tag|Clean uncoated paper plate`],
['Plastic packaging','Empty rigid plastic packaging','R1',`Shampoo bottle|Conditioner bottle|Body wash bottle|Liquid soap bottle|Milk plastic bottle|Juice plastic bottle|Cooking oil plastic bottle|Ice cream tub|Margarine tub|Rigid takeaway tub|Rigid plastic punnet|Rigid plastic pot`],
['Metal and glass','Empty metal packaging','R3',`Soup tin|Bean tin|Pet food tin|Biscuit tin`],
['Metal and glass','Empty glass container','R4',`Jam jar|Pickle jar|Sauce glass bottle|Perfume glass bottle`],
['Mixed packaging','Flexible or multilayer packaging','R6',`Chocolate wrapper|Biscuit wrapper|Bread bag|Frozen food bag|Cling film|Milk pouch|Juice pouch|Lined takeaway paper bowl`],
['E-waste and batteries','Small electrical or electronic device','R8',`Mobile phone|Laptop|Tablet|Phone charger|USB cable|Earphones|Wireless earbuds|Headphones|Computer mouse|Keyboard|Remote control|Power bank|Smartwatch|Digital camera|Calculator|USB flash drive|Memory card|External hard drive|Wi-Fi router|Small speaker|Electric toothbrush|Electric shaver|Hair dryer|Electric iron|Electric kettle|Game controller`],
['E-waste and batteries','Battery / special waste','R8',`AA battery|AAA battery|Button cell battery|Rechargeable battery`],
['E-waste and batteries','Light bulb / special waste','R8',`LED bulb|CFL bulb|Incandescent bulb`],
['Other household items','Not covered by the sample collection guide',null,`Coffee grounds|Dry leaves|Untreated wood chips|Cooked rice|Meat scraps|Dairy leftovers|Compostable bag|Broken glass|Ceramic mug|Old clothes|Shoes|Polystyrene packaging|Aluminium foil|Paint container|Medicine blister pack|Printer ink cartridge|Refrigerator|Washing machine|Television|Used cooking oil`]
];
for(const [family,material,rule,names] of additions)for(const name of names.split('|'))items.push({name,material,rule,family,keywords:name.toLowerCase()});
for(const item of items){
 item.family ||= item.rule==='R5'?'Food scraps':item.rule==='R8'?'E-waste and batteries':item.rule==='R2'?'Paper and cardboard':item.rule==='R1'?'Plastic packaging':item.rule==='R3'||item.rule==='R4'?'Metal and glass':'Mixed packaging';
 item.compost = item.rule==='R5'||item.name==='Coffee grounds'?'green':['Dry leaves','Untreated wood chips'].includes(item.name)?'brown':null;
 item.collectionCovered=!!item.rule;
}
// A lined bowl is not explicitly covered by the supplied cup rule.
const linedBowl=items.find(i=>i.name==='Lined takeaway paper bowl');linedBowl.rule=null;linedBowl.collectionCovered=false;
export function matchItems(text){const t=text.toLowerCase().trim();if(!t)return [];const exact=items.find(i=>i.name.toLowerCase()===t);if(exact)return [exact];const named=items.filter(i=>t.includes(i.name.toLowerCase()));if(named.length)return named;return items.filter(i=>i.keywords.split(' ').some(w=>w.length>2&&new RegExp('\\b'+w+'s?\\b').test(t)));}
