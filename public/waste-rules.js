// Instant waste rules and dustbin classifications for household objects.
export const WASTE_CATEGORIES = {
  WET: {
    name: 'Wet / Biodegradable Waste',
    bin: 'Food Waste Bin',
    color: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.4)',
    icon: '🟢',
    dustbin: 'Green Bin',
    note: 'Organic matter. Remove all plastic wrappers, stickers or bags first.'
  },
  DRY_RECYCLABLE: {
    name: 'Dry Recyclable Waste',
    bin: 'Dry Recycling Bin',
    color: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.4)',
    icon: '🔵',
    dustbin: 'Blue Bin',
    note: 'Empty, rinse away residue and let dry. Separate lids.'
  },
  GENERAL: {
    name: 'General Waste',
    bin: 'General Waste Bin',
    color: '#eab308',
    glow: 'rgba(234, 179, 8, 0.4)',
    icon: '🟡',
    dustbin: 'Black / Grey Bin',
    note: 'Non-recyclable packaging or food-soiled material.'
  },
  HAZARDOUS: {
    name: 'Hazardous / E-Waste',
    bin: 'Special Collection Desk',
    color: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.4)',
    icon: '🔴',
    dustbin: 'Red / Special Bin',
    note: 'Must NOT go into campus bins. Bring to special waste collection.'
  }
};

// Explicit whitelist of ONLY useful household waste, packaging and discardable items.
// Non-waste items (persons, chairs, furniture, pets, vehicles, appliances) are strictly ignored.
export const ITEM_CLASSIFICATIONS={
 'clear plastic bottle':{category:'DRY_RECYCLABLE',label:'Plastic bottle'},'other plastic bottle':{category:'DRY_RECYCLABLE',label:'Plastic bottle'},'plastic bottle cap':{category:'DRY_RECYCLABLE',label:'Plastic cap'},'plastic lid':{category:'DRY_RECYCLABLE',label:'Plastic lid'},'drink can':{category:'DRY_RECYCLABLE',label:'Metal can'},'food can':{category:'DRY_RECYCLABLE',label:'Food tin'},'metal lid':{category:'DRY_RECYCLABLE',label:'Metal lid'},'normal paper':{category:'DRY_RECYCLABLE',label:'Paper · check clean/dry'},'magazine paper':{category:'DRY_RECYCLABLE',label:'Paper · check clean/dry'},'corrugated carton':{category:'DRY_RECYCLABLE',label:'Cardboard · check residue'},'glass bottle':{category:'GLASS',label:'Glass bottle'},'glass jar':{category:'GLASS',label:'Glass jar'},'food waste':{category:'WET',label:'Biodegradable food scraps'},'paper cup':{category:'GENERAL',label:'Mixed / lined paper cup'},'drink carton':{category:'GENERAL',label:'Mixed drink carton'},'crisp packet':{category:'GENERAL',label:'Multilayer wrapper'},'other plastic wrapper':{category:'GENERAL',label:'Plastic wrapper'},'plastic film':{category:'GENERAL',label:'Flexible plastic'},'single-use carrier bag':{category:'GENERAL',label:'Plastic bag'},'polypropylene bag':{category:'GENERAL',label:'Plastic bag'},'tissues':{category:'GENERAL',label:'Tissue · check soiling'},'battery':{category:'HAZARDOUS',label:'Battery · special collection'},
 'pizza box':{category:'CHECK',label:'Pizza box · check grease'},'broken glass':{category:'CHECK',label:'Broken glass · ask facilities'},'other plastic':{category:'CHECK',label:'Plastic · verify type'},'unlabeled litter':{category:'CHECK',label:'Waste · verify material'},'aerosol':{category:'CHECK',label:'Aerosol · ask facilities'},'styrofoam piece':{category:'CHECK',label:'Foam · guide check'},'aluminium foil':{category:'CHECK',label:'Foil · guide check'},'paper bag':{category:'CHECK',label:'Paper bag · guide check'},'cigarette':{category:'CHECK',label:'Cigarette · guide check'}
};
WASTE_CATEGORIES.GLASS={name:'Glass collection',bin:'Glass collection',dustbin:'Glass collection',color:'#a78bfa',icon:'🟣',glow:'transparent',note:'Sample guide R4: empty and rinse bottles or jars; separate lids.'};
// Recognize the remaining litter classes without inventing disposal guidance.
for(const raw of ['meal carton','other carton','pop tab','glass cup','disposable food container','toilet tube','egg carton','plastic straw','disposable plastic cup','plastic utensils','squeezable tube','spread tub','garbage bag','six pack rings','foam cup','paper straw','aluminium blister pack','rope & strings','other plastic container','scrap metal','plastic glooves','wrapping paper','carded blister pack','foam food container','other plastic cup','metal bottle cap']){
 ITEM_CLASSIFICATIONS[raw]={category:'CHECK',label:raw.charAt(0).toUpperCase()+raw.slice(1)};
}
Object.assign(ITEM_CLASSIFICATIONS,{
 'cardboard':{category:'DRY_RECYCLABLE',label:'Cardboard box · Dry recycling',catalog:'Cardboard box',family:'cardboard',tip:'Flatten clean cardboard and put in dry recycling.'},
 'other carton':{category:'CHECK',label:'Cardboard / carton · verify lining',family:'cardboard'},
 'banana peel':{category:'WET',label:'Banana peel',catalog:'Banana peel',family:'banana'},
 'orange peel':{category:'WET',label:'Orange peel',catalog:'Orange peel',family:'orange'},
 'vegetable scraps':{category:'WET',label:'Vegetable scraps',catalog:'Vegetable scraps'},
 'eggshells':{category:'WET',label:'Eggshells',catalog:'Eggshells'},
 'tea leaves':{category:'WET',label:'Loose tea leaves',catalog:'Tea leaves'},
 'bottle':{category:'DRY_RECYCLABLE',label:'Plastic bottle',catalog:'Plastic bottle',family:'bottle',tip:'Empty, rinse away residue and let dry. Separate lids.'},
 'can':{category:'DRY_RECYCLABLE',label:'Metal can',catalog:'Drink can',family:'can',tip:'Empty metal can. Rinse and let dry.'},
 'tin can':{category:'DRY_RECYCLABLE',label:'Metal can',catalog:'Food tin',family:'can'},
 'aluminum can':{category:'DRY_RECYCLABLE',label:'Metal can',catalog:'Drink can',family:'can'},
 'plastic container':{category:'DRY_RECYCLABLE',label:'Rigid plastic container',catalog:'Rigid plastic container'},
 'cup':{category:'CHECK',label:'Cup · verify lining',family:'cup',uncertain:true},
 'rigid plastic container':{category:'DRY_RECYCLABLE',label:'Rigid plastic container',catalog:'Rigid plastic container'},
 'cardboard egg carton':{category:'DRY_RECYCLABLE',label:'Cardboard egg carton',catalog:'Cardboard egg carton',tip:'Keep clean and dry. Flatten cardboard. Separate any food-soiled sections.'},
 'laptop':{category:'HAZARDOUS',label:'Laptop · Special E-waste desk',catalog:'Laptop',family:'electronics',tip:'Laptops and electronics must not go into campus bins. Hand in at the special waste desk.'},
 'cell phone':{category:'HAZARDOUS',label:'Cell phone · Special E-waste desk',catalog:'Mobile phone',family:'electronics',tip:'Mobile phones contain rechargeable lithium batteries. Hand in at the special waste desk.'},
 'mobile phone':{category:'HAZARDOUS',label:'Mobile phone · Special E-waste desk',catalog:'Mobile phone',family:'electronics',tip:'Hand in at the special waste desk.'},
 'phone cover':{category:'GENERAL',label:'Phone cover · General waste',family:'packaging',tip:'Silicone/TPU phone cases cannot be recycled in campus dry recycling. Dispose in general waste.'},
 'phone case':{category:'GENERAL',label:'Phone case · General waste',family:'packaging',tip:'Silicone/TPU phone cases cannot be recycled in campus dry recycling. Dispose in general waste.'},
 'cover':{category:'GENERAL',label:'Phone/protective cover · General waste'},
 'paper':{category:'DRY_RECYCLABLE',label:'Paper · Clean and dry',catalog:'Newspaper',family:'paper',tip:'Clean, dry paper goes in dry recycling. Tear off soiled sections.'},
 'tissue':{category:'GENERAL',label:'Tissue paper · General waste',catalog:'Used tissue',family:'soiled_paper',tip:'Used tissues and napkins go in general waste under Rule R7.'},
 'tissue paper':{category:'GENERAL',label:'Tissue paper · General waste',catalog:'Used tissue',family:'soiled_paper',tip:'Used tissues and napkins go in general waste under Rule R7.'},
 'napkin':{category:'GENERAL',label:'Paper napkin · General waste',catalog:'Used tissue',family:'soiled_paper'},
 'coffee cup':{category:'GENERAL',label:'Coffee cup · Mixed lining',catalog:'Coffee cup',family:'cup',tip:'Plastic-lined takeaway paper cup goes in general waste. Separate rigid lid into dry recycling.'},
 'takeaway cup':{category:'GENERAL',label:'Takeaway cup · Mixed lining',catalog:'Coffee cup',family:'cup'},
 'water bottle':{category:'DRY_RECYCLABLE',label:'Plastic water bottle',catalog:'Plastic bottle',family:'bottle'},
 'mouse':{category:'HAZARDOUS',label:'Computer mouse · E-waste',catalog:'Computer mouse',family:'electronics'},
 'keyboard':{category:'HAZARDOUS',label:'Keyboard · E-waste',catalog:'Keyboard',family:'electronics'},
 'charger':{category:'HAZARDOUS',label:'Phone charger · E-waste',catalog:'Phone charger',family:'electronics'},
 'earphones':{category:'HAZARDOUS',label:'Earphones · E-waste',catalog:'Earphones',family:'electronics'},
 'wet waste':{category:'WET',label:'Wet waste · Food & Organic',catalog:'Vegetable scraps',tip:'Organic kitchen waste, food scraps, fruit/vegetable peels go in the green bin.'},
 'organic waste':{category:'WET',label:'Wet waste · Organic matter',catalog:'Vegetable scraps',tip:'Organic biodegradable waste goes in the green food waste bin.'},
 'kitchen waste':{category:'WET',label:'Wet waste · Kitchen scraps',catalog:'Vegetable scraps'},
 'food scraps':{category:'WET',label:'Wet waste · Food scraps',catalog:'Vegetable scraps'},
 'fruit scraps':{category:'WET',label:'Wet waste · Fruit peels',catalog:'Banana peel'},
 'bread':{category:'WET',label:'Bread / food waste · Wet waste',catalog:'Vegetable scraps'},
 'rice':{category:'WET',label:'Rice / leftovers · Wet waste',catalog:'Vegetable scraps'},
 'fabric':{category:'CHECK',label:'Fabric / Textile · Check guide',catalog:'Old clothes',family:'textile',tip:'Fabrics and clothes are not accepted in standard dry recycling. Donate clean textiles or use designated clothing bins.'},
 'textile':{category:'CHECK',label:'Textile / Fabric · Check guide',catalog:'Old clothes',family:'textile',tip:'Fabrics and clothes are not accepted in standard dry recycling. Donate clean textiles or use designated clothing bins.'},
 'clothes':{category:'CHECK',label:'Old clothes · Check guide',catalog:'Old clothes',family:'textile',tip:'Clean clothes can be donated or taken to a dedicated textile drop-off.'},
 'clothing':{category:'CHECK',label:'Clothing · Check guide',catalog:'Old clothes',family:'textile',tip:'Clean clothes can be donated or taken to a dedicated textile drop-off.'},
 'cardboard box':{category:'DRY_RECYCLABLE',label:'Cardboard box · Dry recycling',catalog:'Cardboard box',family:'cardboard',tip:'Flatten cardboard box. Ensure no greasy or food-soiled sections go into dry recycling.'},
 'clean cardboard':{category:'DRY_RECYCLABLE',label:'Clean cardboard · Dry recycling',catalog:'Cardboard box',family:'cardboard',tip:'Flatten clean cardboard and put in dry recycling.'},
 'newspaper':{category:'DRY_RECYCLABLE',label:'Newspaper · Dry recycling',catalog:'Newspaper',family:'paper',tip:'Clean, dry newspaper and paper sheets go into dry recycling.'},
 'clean paper':{category:'DRY_RECYCLABLE',label:'Clean paper · Dry recycling',catalog:'Newspaper',family:'paper',tip:'Clean, dry paper goes in dry recycling.'}
});
for(const raw of ['normal paper','magazine paper','corrugated carton'])ITEM_CLASSIFICATIONS[raw].tip='Clean, dry paper and cardboard go in dry recycling. Flatten boxes. Separate greasy or food-soiled sections into general waste.';
for(const food of ['banana','apple','orange','broccoli','carrot','sandwich','hot dog','donut','cake'])ITEM_CLASSIFICATIONS[food]={category:'WET',label:food[0].toUpperCase()+food.slice(1)+' · Wet Waste',family:food,uncertain:true,tip:'Food detected. Confirm it is discarded food or scraps before sorting. Remove packaging.'};
for(const raw of ['clear plastic bottle','other plastic bottle','glass bottle'])ITEM_CLASSIFICATIONS[raw].family='bottle';
ITEM_CLASSIFICATIONS['pizza box'].family='cardboard';ITEM_CLASSIFICATIONS['corrugated carton'].family='cardboard';
WASTE_CATEGORIES.CHECK={name:'Needs confirmation',bin:'Check local guide',dustbin:'Guide check',color:'#94a3b8',icon:'⚪',glow:'transparent',note:'Material detected; disposal is not confirmed by the guide.'};
WASTE_CATEGORIES.WET.dustbin='Biodegradable';WASTE_CATEGORIES.DRY_RECYCLABLE.dustbin='Dry recycling';WASTE_CATEGORIES.GENERAL.dustbin='General waste';WASTE_CATEGORIES.HAZARDOUS.dustbin='Special collection';

// Explicit blocklist: Things that must NEVER be identified as waste
export const NON_WASTE_CLASSES = new Set([
  'person', 'face', 'hand',
  'chair', 'couch', 'bed', 'dining table', 'toilet',
  'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'bird',
  'car', 'truck', 'bus', 'train', 'motorcycle', 'bicycle', 'airplane', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
  'tv', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator',
  'umbrella', 'backpack', 'handbag', 'suitcase'
]);

export function classifyWasteObject(rawClass) {
  const key = String(rawClass || '').toLowerCase().trim();

  // If it's a person, furniture, animal or background item, immediately reject it
  if (NON_WASTE_CLASSES.has(key)) {
    return {
      recognized: false,
      isNonWaste: true,
      label: key,
      rawClass: key,
      category: 'Not Waste',
      bin: 'Ignored',
      dustbin: 'Ignored',
      color: '#64748b',
      glow: 'transparent',
      icon: '⚪',
      note: 'Not a waste item'
    };
  }

  const match = ITEM_CLASSIFICATIONS[key];
  if (match) {
    const categoryInfo = WASTE_CATEGORIES[match.category] || WASTE_CATEGORIES.GENERAL;
    return {
      recognized: true,
      isNonWaste: false,
      label: match.label,
      rawClass: key,
      category: categoryInfo.name,
      bin: match.bin || categoryInfo.bin,
      dustbin: categoryInfo.dustbin,
      color: categoryInfo.color,
      glow: categoryInfo.glow,
      icon: categoryInfo.icon,
      note: match.tip || categoryInfo.note,
      family:match.family||key,uncertain:match.uncertain===true,catalog:match.catalog||null
    };
  }

  // Any other random class not in the whitelist is ignored
  return {
    recognized: false,
    isNonWaste: false,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    rawClass: key,
    category: 'Needs Check',
    bin: 'Check Campus Guide or Gemini AI',
    dustbin: 'Ask AI ↗',
    color: '#94a3b8',
    glow: 'rgba(148, 163, 184, 0.35)',
    icon: '⚪',
    note: 'Tap Inspect to verify with Gemini AI'
  };
}
