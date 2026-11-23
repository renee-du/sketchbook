"""Every new page: the things on it (900x1300 page px), how to cut them out, and how they behave.
Earlier items claim their pixels first.

b   = how it is drawn / moves on its own (sprite, sway, tree, crowd, water, fan, sip, flutter, pendulum, tail, text...)
on  = what a tap does, in order; 'color' happens once, then the rest cycle
col = pencil colours for colouring in: an (r,g,b), or [[y, (r,g,b)], ...] stops down the page
"""
T = dict(b='text')
def circ(cx, cy, r, n=28):
    import math
    return [(round(cx + r * math.cos(i / n * 6.283)), round(cy + r * math.sin(i / n * 6.283))) for i in range(n)]

STONE = (232, 204, 156); JADE = (150, 198, 168); BLUSH = (236, 168, 172)
UPHOLSTERY = [(228, 186, 92), (156, 184, 140), (140, 166, 204), (212, 132, 104), (232, 172, 172), None]
CLAIM = dict(b='static')

PAGES = {
 # ------------------------------------------------------------- Seillans
 'fr_L': [
  dict(id='t_title', box=(50, 20, 405, 90), **T),
  dict(id='lantern', box=(250, 295, 388, 448), b='glow', glow=(292, 352, 190), on=['glow']),
  dict(id='flowers', box=(575, 728, 705, 802), on=['color'], col=[[735, (214, 72, 86)], [772, (218, 104, 96)], [784, (200, 128, 96)]]),
  dict(id='cattail', box=(752, 962, 822, 1056), remove=True, fill=(-300, 60)),
  dict(id='catgone', poly=[(512, 1030), (560, 1000), (604, 1012), (612, 1044), (700, 1048), (754, 1040), (790, 1060), (812, 1070),
                       (828, 1110), (848, 1160), (846, 1228), (800, 1228), (782, 1165), (700, 1170), (662, 1210), (612, 1218), (556, 1210),
                       (540, 1188), (586, 1150), (586, 1098), (536, 1082), (514, 1062)], remove=True, fill=(-300, 10)),
  dict(id='sky', box=(0, 90, 900, 330), zone='birds'),
  dict(id='street', box=(0, 860, 900, 1300), zone='street'),
 ],
 'fr_R': [
  dict(id='t_title', box=(55, 25, 440, 100), **T),
  dict(id='spoon', box=(552, 96, 712, 478), pv=(630, 410), tip=(632, 408), drips=dict(at=[(612, 470), (655, 462), (680, 440)], col=(176, 112, 70), every=3.2)),
  dict(id='fork', box=(72, 712, 228, 1012), on=['bite'], r=30, protect=[(150, 830), (228, 820), (228, 1012), (72, 1012), (72, 930)], pv=(110, 1000)),
  dict(id='split', box=(138, 200, 838, 928), on=['scoop'], r=44, tool='spoon', pv=(480, 900)),
  dict(id='t_banana', box=(88, 930, 510, 1042), **T),
  dict(id='t_quote', box=(262, 1045, 752, 1118), **T),
 ],
 # ------------------------------------------------------------- Spain
 'es_L': [
  dict(id='t_agua', box=(612, 108, 822, 258), **T),
  dict(id='t_aguacate', box=(338, 393, 552, 502), **T),
  dict(id='t_pitahaya', box=(728, 548, 906, 668), **T),
  dict(id='t_limon', box=(393, 593, 477, 652), **T),
  dict(id='t_strac', box=(8, 593, 192, 708), **T),
  dict(id='t_pist', box=(143, 913, 237, 1102), **T),
  dict(id='cup1', box=(128, 58, 377, 507), b='sip', on=['sip'], level=(272, 497), pv=(250, 500)),
  dict(id='spoon2', box=(133, 538, 357, 657), drips=dict(at=[(345, 652)], col=(226, 190, 92), every=2.6)),
  dict(id='cup2', box=(498, 448, 732, 787), b='sip', on=['sip'], level=(520, 777), pv=(615, 780)),
  dict(id='limon', box=(278, 618, 457, 807), on=['bite'], r=34, pv=(365, 800)),
  dict(id='strac', box=(58, 628, 287, 842), on=['bite'], r=38, pv=(170, 835)),
  dict(id='cone', box=(188, 763, 362, 1167), on=['bite'], r=36, pv=(275, 1160), drips=dict(at=[(232, 862), (300, 880)], col=(196, 214, 150), every=4)),
  dict(id='tray', box=(273, 843, 907, 1227), on=['scoop'], r=52, protect=[(273, 1172), (907, 1150), (907, 1227), (273, 1227)], pv=(590, 1220)),
 ],
 'es_R': [
  dict(id='t_tapas', box=(188, 128, 612, 258), **T),
  dict(id='t_patatas', box=(438, 483, 802, 602), **T),
  dict(id='t_gambas', box=(68, 613, 292, 697), **T),
  dict(id='t_croq', box=(593, 648, 797, 707), **T),
  dict(id='t_mont', box=(3, 813, 487, 887), **T),
  dict(id='t_cheese', box=(223, 1153, 567, 1267), **T),
  dict(id='t_tort1', box=(673, 1053, 827, 1107), **T),
  dict(id='t_tort2', box=(593, 1218, 762, 1272), **T),
  dict(id='fork1', box=(648, 172, 742, 334), pv=(700, 320), tip=(690, 318)),
  dict(id='patatas', box=(298, 273, 867, 567), mask='color', on=['pieces'], pieces=True, tool='fork1'),
  dict(id='gambas', box=(103, 283, 272, 617), on=['bite'], r=30, pv=(185, 612)),
  dict(id='mont', box=(58, 698, 567, 817), on=['bite'], r=36, pv=(310, 812)),
  dict(id='croq', box=(548, 713, 792, 892), on=['bite'], r=40, pv=(680, 880)),
  dict(id='board', box=(93, 853, 597, 1217), on=['pieces'], pieces=True, under=(240, 237, 230)),
  dict(id='tortilla', box=(613, 1098, 847, 1262), on=['bite'], r=38, pv=(730, 1255)),
 ],
 # ------------------------------------------------------------- Rome sights
 'ro_L': [
  dict(id='t_title', box=(25, 10, 318, 82), **T),
  dict(id='t_coins', box=(48, 318, 302, 392), **T),
  dict(id='coin1', poly=circ(136, 449, 86), on=['toss'], target=(600, 668), pv=(136, 449)),
  dict(id='coin2', poly=circ(206, 508, 68), on=['toss'], target=(470, 676), pv=(206, 508)),
  dict(id='water', cmask=[(330, 640), (420, 618), (560, 612), (700, 616), (800, 630), (808, 676), (700, 702), (560, 706), (420, 702), (330, 684)], box=(325, 598, 812, 708), b='water', mask='box', on=['color', 'splash'], col=(118, 176, 206)),
  dict(id='trevi', box=(233, 8, 897, 708), on=['color'], col=[[0, (236, 214, 170)], [560, STONE]]),
  dict(id='t_trevi', box=(378, 728, 677, 797), **T),
  dict(id='columns', box=(58, 683, 407, 1242), on=['color'], col=(230, 196, 158)),
  dict(id='lamp', box=(503, 803, 837, 1217), b='glow', glow=(548, 885, 210), on=['glow']),
 ],
 'ro_R': [
  dict(id='t_colos', box=(583, 63, 807, 117), **T),
  dict(id='t_pizza', box=(273, 1138, 632, 1207), **T),
  dict(id='tree', box=(682, 228, 762, 702), b='tree', pv=(712, 700), on=['color'], col=(112, 152, 98)),
  dict(id='crowd', cmask='figures', box=(23, 606, 702, 802), b='crowd', mask='box', on=['color'], col='confetti'),
  dict(id='colos', box=(38, 73, 702, 622), on=['color'], col=[[60, (238, 196, 140)], [600, (230, 172, 118)]]),
  dict(id='knife', poly=[(468, 1006), (560, 964), (690, 920), (708, 930), (697, 950), (586, 996), (486, 1027)], pv=(480, 1015)),
  dict(id='pizza', box=(178, 843, 707, 1142), on=['slice'], c=(412, 1028), wedges=[[8, 102], [102, 155], [155, 208], [208, 262], [262, 315], [315, 368]], knife='knife'),
  dict(id='sky', box=(0, 0, 900, 220), zone='birds'),
 ],
 # ------------------------------------------------------------- Tianzifang
 'sh_L': [
  dict(id='t_title', box=(173, 43, 387, 107), **T),
  dict(id='sign', box=(148, 298, 397, 472), b='pendulum', pv=(200, 300), k=24, idle=.012, on=['color'], col=(208, 86, 76)),
  dict(id='rack', box=(543, 498, 702, 732), b='sway', pv=(620, 505), amp=4, on=['gust']),
  dict(id='people', box=(418, 438, 522, 622), b='crowd', mask='box'),
  dict(id='cathead', poly=[(536, 932), (604, 926), (654, 942), (660, 1000), (644, 1040), (600, 1050), (552, 1040), (536, 990)], b='head', pv=(592, 1042), parent='cat', on=['purr']),
  dict(id='tail', box=(208, 1080, 338, 1208), b='tail', pv=(330, 1102), parent='cat'),
  dict(id='cat', box=(298, 928, 647, 1212), b='breathe', pv=(470, 1205), on=['purr']),
 ],
 'sh_R': [
  dict(id='wingL', poly=[(15, 448), (70, 440), (92, 468), (86, 512), (60, 556), (20, 556), (4, 500)], exclude=[(-10, 708), (12, 716), (124, 512), (100, 500)], b='flutter', axis=(66, 598, -60.6), side=-1, parent=None, on=['color'], col=(194, 170, 222), group='bfly'),
  dict(id='wingR', poly=[(84, 470), (130, 452), (205, 468), (230, 540), (218, 602), (176, 656), (118, 652), (80, 604), (100, 540)], exclude=[(-10, 708), (12, 716), (124, 512), (100, 500)], b='flutter', axis=(66, 598, -60.6), side=1, on=['color'], col=(194, 170, 222), group='bfly'),
  dict(id='dangle', poly=[(42, 612), (152, 612), (152, 792), (42, 792)], exclude=[(-10, 708), (12, 716), (124, 512), (100, 500)], b='pendulum', pv=(66, 618), k=10, idle=.06, on=['jingle']),
  dict(id='pendant', box=(248, 418, 337, 657), b='pendulum', pv=(292, 424), k=14, idle=.05, on=['jingle']),
  dict(id='bracelet', cmask='holes', box=(138, 153, 772, 442), on=['color'], col=JADE),
  dict(id='oyster', box=(433, 458, 737, 687), on=['color', 'pearl'], col=[[460, (222, 206, 226)], [600, (196, 212, 226)]], pearl=(562, 572)),
  dict(id='fan', box=(113, 763, 602, 1142), b='fan', pv=(470, 1122), a=(-172, -54), on=['color', 'fold'], col=[[760, BLUSH], [1100, (226, 196, 150)]]),
  dict(id='lid', box=(583, 843, 847, 980), pv=(715, 975), on=['color', 'lid'], col=[[840, (206, 172, 96)], [980, (120, 168, 172)]], group='tin'),
  dict(id='tin', box=(583, 960, 847, 1140), pv=(715, 1135), on=['color', 'lid'], col=(120, 168, 172), group='tin'),
 ],
 # ------------------------------------------------------------- furniture: drag to arrange, tap to upholster
 'fu_L': [
  dict(id='lamp', box=(173, 0, 752, 222), b='glow', glow=(668, 64, 330), parent='sofa', behind=True, on=['glow'], opaque=True),
  dict(id='pillowL', box=(208, 183, 442, 362), parent='sofa', on=['color'], col=UPHOLSTERY[3:] + UPHOLSTERY[:3], opaque=True),
  dict(id='pillowR', box=(488, 153, 672, 317), parent='sofa', on=['color'], col=UPHOLSTERY[1:] + UPHOLSTERY[:1], opaque=True),
  dict(id='sofa', cmask=[(150, 420), (185, 250), (300, 215), (440, 215), (560, 190), (660, 240), (735, 300), (745, 430), (600, 470), (450, 515), (300, 568), (160, 575)], box=(123, 188, 752, 607), drag=True, z=600, pv=(440, 600), on=['color'], col=UPHOLSTERY, opaque=True),
  dict(id='table', box=(758, 253, 900, 522), z=520, opaque=True),
  dict(id='glass1', box=(348, 708, 422, 837), parent='stool', on=['clink'], opaque=True),
  dict(id='glass2', box=(538, 743, 612, 857), parent='stool', on=['clink'], opaque=True),
  dict(id='stool', cmask=[(300, 800), (400, 750), (560, 750), (650, 800), (680, 900), (640, 980), (670, 1080), (640, 1170), (520, 1205), (350, 1200), (290, 1130), (300, 1030), (275, 950), (290, 860)], box=(168, 703, 697, 1257), drag=True, z=1240, pv=(430, 1240), on=['color'], col=UPHOLSTERY[2:] + UPHOLSTERY[:2], opaque=True),
  dict(id='edge', box=(800, 1060, 900, 1220), remove=True),
 ],
 'fu_R': [
  dict(id='plant', poly=[(30, 830), (70, 812), (132, 820), (152, 850), (122, 880), (102, 948), (64, 948), (54, 880), (24, 860)], parent='table2', on=['color'], col=[[820, (120, 160, 100)], [905, (196, 128, 96)]], opaque=True),
  dict(id='table2', poly=[(0, 874), (60, 871), (150, 877), (214, 892), (220, 925), (202, 950), (182, 962), (180, 1040), (206, 1060), (196, 1102), (0, 1102)], z=1100, opaque=True),
  dict(id='chair', cmask=[(230, 300), (300, 250), (400, 185), (560, 175), (690, 190), (705, 300), (700, 550), (600, 575), (420, 570), (300, 560), (240, 520)], box=(178, 163, 777, 707), drag=True, z=700, pv=(470, 690), on=['color'], col=UPHOLSTERY[4:] + UPHOLSTERY[:4], opaque=True),
  dict(id='sofa2', cmask=[(15, 860), (20, 800), (120, 760), (260, 725), (400, 745), (470, 790), (560, 760), (700, 742), (820, 790), (855, 880), (845, 1050), (800, 1120), (680, 1155), (540, 1160), (430, 1125), (360, 1070), (250, 1025), (120, 1012), (30, 985)], poly=[(0, 760), (120, 736), (300, 716), (520, 712), (720, 716), (880, 756), (892, 1212), (330, 1212), (150, 1120), (0, 1112)], drag=True, z=1000, pv=(540, 1190), on=['color'],
       col=UPHOLSTERY[1:] + UPHOLSTERY[:1], opaque=True,
       extra=[[(16, 866), (9, 924), (27, 982), (82, 1010), (168, 1014), (226, 1004)], [(60, 905), (110, 930), (170, 945), (222, 948)]]),
 ],
 # ------------------------------------------------------------- clothes: tap for another colourway
 'cl_L': [
  dict(id='t_clothes', box=(568, 148, 747, 277), **T),
  dict(id='cap', box=(208, 13, 367, 107), pv=(288, 95), on=['flip']),
  dict(id='top', box=(148, 128, 472, 392), b='sway', pv=(300, 138), amp=5, on=['hue']),
  dict(id='shorts', box=(213, 368, 472, 592), b='sway', pv=(340, 375), amp=6, on=['hue']),
  dict(id='dress', box=(573, 453, 887, 947), b='sway', pv=(720, 470), amp=10, on=['color', 'gust'], col=[[470, (150, 176, 214)], [940, (236, 214, 196)]]),
  dict(id='shoe', box=(3, 728, 467, 1062), pv=(420, 1050), on=['hue']),
 ],
 'cl_R': [
  dict(id='clog', box=(433, 33, 762, 222), pv=(600, 215), on=['hue']),
  dict(id='tank', box=(123, 118, 352, 362), b='sway', pv=(240, 128), amp=5, on=['hue']),
  dict(id='skirt', box=(118, 343, 352, 588), b='sway', pv=(240, 350), amp=8, on=['hue']),
  dict(id='flatL', box=(138, 583, 257, 642), pv=(195, 638), on=['step'], group='flats'),
  dict(id='flatR', box=(253, 588, 367, 642), pv=(310, 638), on=['step'], group='flats'),
  dict(id='denim', box=(413, 323, 807, 912), b='sway', pv=(610, 335), amp=9, on=['hue']),
  dict(id='plaid', box=(173, 743, 367, 1107), b='sway', pv=(270, 752), amp=6, on=['hue']),
  dict(id='sneakL', poly=[(423, 993), (578, 993), (584, 1040), (520, 1072), (423, 1072)], pv=(500, 1068), on=['step'], group='sneakers'),
  dict(id='sneakR', box=(513, 1028, 732, 1130), pv=(620, 1125), on=['step'], group='sneakers'),
 ],
}
SPREADS = [('ro_L', 'ro_R'), ('fr_L', 'fr_R'), ('es_L', 'es_R'), ('sh_L', 'sh_R'), ('fu_L', 'fu_R'), ('cl_L', 'cl_R')]
SOURCE = {'fr': 'france', 'es': 'spain', 'ro': 'rome', 'sh': 'shanghai', 'fu': 'furniture', 'cl': 'clothes'}
