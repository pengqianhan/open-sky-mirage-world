// The approved cartoon interpretation. Sizes are game proportions, not actor measurements.
// `look` drives the painted face and hair: iris tints, how sharp the eyes are, brow and mouth shape.
// 曾信与荆南王是同一具身体：脸、身高、皮肤和发色只在这里写一次，两种形态都从它派生，改脸不会改出两张脸。
const ZENGXIN_BODY = { skin: '#f7d2b8', face: 'youth', height: .95, fringe: 'zengxin', hairTint: '#2a2329', hairDeep: '#17131a', hairLight: '#8a7f8e' };
const ZENGXIN_IRIS = { iris: '#35261f', mouth: '#bb6a60', mouthWidth: .017 };

export const LEADS = [
  { id: 'caosheng', name: '曹晟', caption: '靛衣行客', description: '靛蓝长袍外搭墨色无袖褂，围领半束发。', color: '#34566a',
    robe: '#2f5a8e', robeDeep: .62, over: '#2a2b33', inner: '#efece2', trim: '#6f93bd', belt: '#2d2c30', boots: '#2b2a2e', skin: '#f3cdb2',
    hair: 'half', hairTint: '#2a2632', hairDeep: '#17141d', hairLight: '#7d7f9e', face: 'slim', hem: .44, height: 1.02, prop: null,
    look: { iris: '#2e3550', irisLight: '#7f98c9', eye: 'calm', mouth: '#b0695c', mouthWidth: .02, mouthCurve: 9 } },
  { id: 'zengqian', name: '曾倩', caption: '朱衣飞羽', description: '砖红劲装、皮质护肩与白羽箭囊，高马尾。', color: '#a64d43',
    robe: '#b8413a', robeDeep: .68, over: '#3f3534', inner: '#f6efe0', trim: '#e6d5ae', belt: '#4b3a32', boots: '#54423a', skin: '#fbd6bd',
    hair: 'pony', hairTint: '#2b2329', hairDeep: '#191418', hairLight: '#8d7878', face: 'round', hem: .25, height: .96, prop: 'bow',
    look: { iris: '#4d2c20', irisLight: '#d09058', eye: 'round', mouth: '#c9625c', mouthWidth: .017, mouthCurve: 22 } },
  { id: 'fengbuhai', name: '封不害', caption: '布衣持杖', description: '赭色短褂、麻绳束腰与破旧围裳，一根长棍。', color: '#947344',
    robe: '#bba98c', robeDeep: .72, over: '#b87a2f', inner: '#e6dcc4', trim: '#d8c29a', belt: '#6d4a2f', boots: '#5c4331', skin: '#e3b08f',
    hair: 'bun', hairTint: '#3c2a22', hairDeep: '#241812', hairLight: '#a07f62', face: 'angular', hem: .44, height: 1.01, prop: 'staff',
    look: { iris: '#3e2a18', irisLight: '#bb8a4c', eye: 'bold', mouth: '#a5604c', mouthWidth: .026, mouthCurve: 14 } },
  { id: 'yunniang', name: '芸娘', caption: '双辫流萤', description: '双辫缠鹅黄丝带，白衣鹅黄裙，背负双短刀。', color: '#d4b76e',
    robe: '#f7f3e8', robeDeep: .95, over: '#f2d98e', inner: '#fffdf6', trim: '#e6c264', belt: '#f0dc9f', boots: '#efe4cb', skin: '#fcd8c4',
    hair: 'braids', hairTint: '#2d2428', hairDeep: '#1a1417', hairLight: '#9c8284', face: 'soft', hem: .46, height: .94, prop: 'knives',
    look: { iris: '#50311f', irisLight: '#dca163', eye: 'round', mouth: '#d0686a', mouthWidth: .015, mouthCurve: 28 } },
  { id: 'xiejingtang', name: '谢景棠', caption: '素袍藏机', description: '灰白宽袖、深灰领缘与腰带，随身机关匣。', color: '#b7c0b9',
    robe: '#e3e3da', robeDeep: .84, over: '#74787a', inner: '#fbfaf3', trim: '#74787a', belt: '#6c7073', boots: '#3a3a3f', skin: '#f0c8a8',
    hair: 'half', hairTint: '#33261f', hairDeep: '#1e1612', hairLight: '#957a66', face: 'long', hem: .46, height: 1.05, prop: 'case',
    look: { iris: '#40291b', irisLight: '#c2925f', eye: 'gentle', mouth: '#ad6757', mouthWidth: .019, mouthCurve: 12 } },
  { id: 'linhan', name: '林寒', caption: '玄衣守阙', description: '玄黑长袍、宽皮腰封与高马尾，长刀守阙。', color: '#697c83',
    robe: '#2d333c', robeDeep: .7, over: '#23272e', inner: '#454c58', trim: '#a8afb3', belt: '#5a4332', boots: '#25262a', skin: '#f6d3bc',
    hair: 'high', hairTint: '#211d24', hairDeep: '#120f15', hairLight: '#7b7a8b', face: 'sharp', hem: .44, height: 1, prop: 'poleblade',
    look: { iris: '#262a35', irisLight: '#8294b3', eye: 'sharp', mouth: '#a95b5c', mouthWidth: .015, mouthCurve: 4 } },
  // 全员中唯一的孩子：比例矮、头略大。剧情上这具身体里是天外之人，所以眼神沉静，不做甜笑。
  { id: 'tongtong', name: '童童', caption: '稚颜天外', description: '粉衣米白菱纹褂，斜挎玫红布带，齐刘海单发髻。孩子的身体里，住着讲述天外的人。', color: '#c9626f',
    robe: '#ecb7ae', robeDeep: .88, over: '#f1e8d4', inner: '#fbf1e4', trim: '#dfa899', belt: '#b9455d', boots: '#d8a79b', skin: '#fcdcc9',
    hair: 'topknot', hairTint: '#262027', hairDeep: '#151117', hairLight: '#857a8c', face: 'child', hem: .4, height: .8, headScale: 1.07, prop: null,
    look: { iris: '#2c2320', irisLight: '#a98660', eye: 'still', mouth: '#c4706c', mouthWidth: .012, mouthCurve: 5 } },
  { ...ZENGXIN_BODY, id: 'zengxin', name: '曾信', formLabel: '曾信', forms: ['zengxin', 'jingnan'], caption: '少年负囊', description: '米白短褂、浅青长裙，双皮带与斜背带，额上一条编织头带。曾倩一路在找的弟弟。', color: '#7fa79a',
    robe: '#b7cfc5', robeDeep: .9, over: '#ede7d7', inner: '#e0ebe4', trim: '#a9c0b5', belt: '#5c4937', boots: '#b6ab96',
    hair: 'headband', hem: .46, prop: null, stance: { lean: .02, chin: .02, armOut: -.02 }, fingerRub: { every: 26, last: 2.4 },
    look: { ...ZENGXIN_IRIS, irisLight: '#d2a06c', eye: 'round', mouthCurve: 24 } },
  // 不是另一个人物，而是图鉴里「曾信」位置的另一种形态：同一张脸，换了里面的人。
  { ...ZENGXIN_BODY, id: 'jingnan', formOf: 'zengxin', name: '荆南王', formLabel: '荆南王', caption: '借身夺权', description: '还是曾信的脸。羽冠盔、狮首护肩、蓝黑甲与弯刀，里面已经换了人。', color: '#34465f',
    robe: '#1b2029', robeDeep: .78, over: '#2c405e', inner: '#efe6d3', trim: '#11131a', belt: '#1f232c', boots: '#13141a',
    hair: 'helmet', hem: .44, prop: 'saber', stance: { lean: -.035, chin: -.05, armOut: .1 }, fingerRub: { every: 9, last: 2.6 },
    look: { ...ZENGXIN_IRIS, irisLight: '#8fa8bd', eye: 'cold', mouthCurve: 2 }, blush: .12 },
  // 清风楼门前迎客伙计（第一集 18:28）：米褐短袖外褂、浅青白长衫与左肩白搭巾，只守在清风楼门口迎客。
  { id: 'dongzi', name: '东子', caption: '清风迎客', description: '米褐短袖外褂、浅青白长衫，左肩搭一条白布迎客巾，只守在清风楼门口迎送往来宾客。', color: '#8f7d63',
    robe: '#d6dfd9', robeDeep: .84, over: '#d5c7ae', inner: '#eef2ef', trim: '#8c7a62', belt: '#6e5d49', boots: '#282523', skin: '#f2ccb0',
    hair: 'bun', fringe: 'zengxin', hairTint: '#231d19', hairDeep: '#120e0c', hairLight: '#6b5b4e', face: 'round', hem: .44, height: .96, prop: null,
    stance: { lean: .02, chin: .01, armOut: .04 },
    look: { iris: '#38261b', irisLight: '#c49562', eye: 'gentle', mouth: '#b4695b', mouthWidth: .018, mouthCurve: 20 } },
  // 顾府二公子顾廷美（EP10 38:57–42:35 & EP11）：淡紫宽袖纱袍、深紫团花锦背心、银紫发冠与垂肩淡紫发带，佩长剑。
  { id: 'gutingmei', name: '顾廷美', caption: '紫袍佩剑', description: '淡紫宽袖纱袍外罩深紫锦背心，银紫发冠，两条淡紫发带垂在胸前，腰佩长剑。顾府二公子。', color: '#7b5ca8',
    robe: '#c6b0de', robeDeep: .8, over: '#7b5ca8', inner: '#f2eef5', trim: '#5a3e85', belt: '#4b346e', boots: '#181520', skin: '#f6d2bc',
    hair: 'high', fringe: 'linhan', hairTint: '#1e1a24', hairDeep: '#100d14', hairLight: '#7c7390', face: 'slim', hem: .46, height: 1.02, prop: 'sword',
    stance: { lean: -.02, chin: -.03, armOut: .03 },
    look: { iris: '#2c2333', irisLight: '#9a86bd', eye: 'sharp', mouth: '#b86670', mouthWidth: .017, mouthCurve: 6 } }
];
// 图鉴里的人物位：形态不单独占位
export const ROSTER = LEADS.filter((c) => !c.formOf);
export const getLead = (id) => LEADS.find(c => c.id === id) || LEADS[0];
export const LEAD_ACTIONS = { idle: '待机', walk: '行走', run: '奔跑', ride: '骑乘', chain: '抓索', glide: '御风', attack: '攻击' };
