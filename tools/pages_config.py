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

def arc(cx, cy, rx, ry, a0, a1, n=24):  # also used for oval cut-outs
    import math
    return [(round(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)), 1), round(cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n)), 1)) for i in range(n + 1)]
R = 900   # right-page offset inside a whole-spread layout

PAGES = {
 # ------------------------------------------------------------- Spain
 'es_L': [
  dict(id='t_agua', box=(612, 108, 822, 258), **T),
  dict(id='t_aguacate', box=(338, 393, 552, 502), **T),
  dict(id='t_pitahaya', box=(728, 548, 906, 668), **T),
  dict(id='t_limon', box=(393, 593, 477, 652), **T),
  dict(id='t_strac', box=(8, 593, 192, 708), **T),
  dict(id='t_pist', box=(143, 913, 237, 1102), **T),
  dict(id='cup1', fizz=(170, 330, 260, 480), box=(128, 58, 377, 507), b='sip', on=['sip'], level=(272, 497), pv=(250, 500)),
  dict(id='spoon2', box=(133, 538, 357, 657), drips=dict(at=[(345, 652)], col=(226, 190, 92), every=2.6)),
  dict(id='cup2', fizz=(540, 690, 620, 760), box=(498, 448, 732, 787), b='sip', on=['sip'], level=(520, 777), pv=(615, 780)),
  dict(id='limon', box=(278, 618, 457, 807), on=['scoop'], r=30, drips=dict(at=[(312, 720), (420, 740)], col=(232, 226, 150), every=5), melt=[(312, 720), (420, 740), (365, 760)], col=(232, 226, 150), pv=(365, 800)),
  dict(id='strac', box=(58, 628, 287, 842), on=['scoop'], r=32, drips=dict(at=[(90, 760), (250, 770)], col=(214, 200, 176), every=6), melt=[(90, 760), (250, 770), (170, 775)], col=(214, 200, 176), pv=(170, 835)),
  dict(id='cone', box=(188, 763, 362, 1167), on=['bite'], r=34, drips=dict(at=[(232, 862), (300, 880)], col=(196, 214, 150), every=4), melt=[(232, 862), (300, 880), (262, 874)], col=(196, 214, 150), pv=(275, 1160)),
  dict(id='sign', poly=[(362, 826), (508, 786), (556, 846), (507, 874), (523, 913), (481, 917), (469, 893), (414, 911)], b='pendulum', pv=(500, 914), k=26, idle=.012, on=['wobble']),
  dict(id='tray', box=(273, 843, 907, 1227), on=['shiver'], pv=(590, 1220)),
 ],
 'es_R': [
  dict(id='t_tapas', box=(188, 128, 612, 258), **T),
  dict(id='t_patatas', box=(438, 483, 802, 602), **T),
  dict(id='t_gambas', box=(68, 613, 292, 697), **T),
  dict(id='t_croq', box=(593, 648, 797, 707), **T),
  dict(id='t_mont', box=(3, 813, 487, 887), **T),
  dict(id='t_tort1', box=(673, 1053, 827, 1107), **T),
  dict(id='t_tort2', box=(593, 1218, 762, 1272), **T),
  dict(id='fork1', poly=[(692, 166), (730, 174), (708, 290), (700, 326), (654, 328), (658, 296), (674, 250)], exclude=[[(600, 276), (676, 276), (676, 299), (600, 299)], [(703, 270), (800, 270), (800, 300), (703, 300)]], nofill=True, pv=(700, 320), tip=(678, 318)),
  dict(id='patatas', box=(298, 273, 867, 567), mask='color', on=['pieces'], pieces=True, tool='fork1'),
  dict(id='gambas', box=(103, 283, 272, 617), on=['bite'], r=30, pv=(185, 612), stick=[(186, 296), (186, 616)], protect=[(178, 283), (194, 283), (194, 345), (178, 345)]),
  dict(id='mont', box=(58, 698, 567, 817), on=['bite'], r=36, pv=(310, 812)),
  dict(id='fork2', poly=[(676, 806), (724, 806), (724, 862), (710, 884), (708, 1062), (692, 1062), (691, 884), (676, 862)], nofill=True, pv=(700, 1060)),
  dict(id='croq', box=(548, 713, 792, 892), on=['bite'], r=40, pv=(680, 880)),
  dict(id='tortilla', box=(613, 1098, 847, 1262), on=['bite'], r=38, pv=(730, 1255)),
 ],
 # ------------------------------------------------------------- Rome sights
 'ro_L': [
  dict(id='t_title', box=(25, 10, 318, 82), **T),
  dict(id='t_coins', box=(48, 318, 302, 392), **T),
  dict(id='coin1', glint=(150, 430), poly=[(round(136 + (75 if 0 <= a <= 100 else 83) * __import__('math').cos(__import__('math').radians(a))), round(449 + (68 if 0 <= a <= 100 else 76) * __import__('math').sin(__import__('math').radians(a)))) for a in range(0, 360, 8)], on=['toss'], target=(600, 668), pv=(136, 449)),
  dict(id='coin2', poly=arc(205, 507, 66, 63, 0, 360, 40), on=['toss'], target=(470, 676), pv=(206, 508), extra=[arc(205, 507, 57, 55, 172, 292)]),
  dict(id='water', box=(325, 598, 812, 708), b='water', mask='box', on=['splash']),
  dict(id='lamp', box=(503, 803, 837, 1217), b='glow', glow=(548, 885, 210), on=['glow']),
 ],
 'ro_R': [
  dict(id='crowd', box=(23, 606, 702, 802), b='crowd', mask='box'),
  dict(id='knife', poly=[(474, 1010), (560, 982), (640, 947), (700, 920), (722, 930), (716, 952), (652, 988), (602, 1013), (560, 1031), (500, 1039), (472, 1030)], pv=(598, 985)),
  dict(id='pizza', steam=[(330, 960), (420, 930), (520, 980), (300, 1040)], box=(140, 826, 725, 1152), noblue=True, on=['slice'], c=(410, 1026), wedges=[[150, 202], [202, 254], [254, 306], [306, 358], [358, 410], [410, 465]], rest=(780, 1085, 1.25), knife='knife', under_rot=(410, 1026, -36, [(474, 1010), (560, 982), (640, 947), (700, 920), (722, 930), (716, 952), (652, 988), (602, 1013), (560, 1031), (500, 1039), (472, 1030)])),
  dict(id='sky', box=(0, 0, 900, 220), zone='birds'),
 ],
 # ------------------------------------------------------------- Tianzifang
 'sh_L': [
  dict(id='t_title', box=(173, 43, 387, 107), **T),
  dict(id='sign', box=(148, 298, 397, 472), b='pendulum', pv=(200, 300), k=24, idle=.012, on=['wobble']),
  dict(id='rack', box=(543, 498, 702, 732), b='sway', pv=(620, 505), amp=4, on=['gust']),
  dict(id='people', box=(418, 438, 522, 622), b='crowd', mask='box'),
  dict(id='cat', box=(196, 924, 668, 1216), b='warp', pv=(470, 1205), on=['pet'], eyes=[(553, 995, 7, 6), (591, 996, 16, 7)],
       neck=(566, 1040), head=(588, 985), tail=(332, 1104), ears=[(562, 944), (612, 938)]),
 ],
 'sh_R': [
  dict(id='wingL', poly=[(15, 448), (70, 440), (92, 468), (86, 512), (60, 556), (20, 556), (4, 500)], exclude=[(-10, 708), (12, 716), (124, 512), (100, 500)], b='flutter', axis=(66, 598, -60.6), on=['flutter']),
  dict(id='wingR', poly=[(84, 470), (130, 452), (205, 468), (230, 540), (218, 602), (176, 656), (118, 652), (80, 604), (100, 540)], exclude=[(-10, 708), (12, 716), (124, 512), (100, 500)], b='flutter', axis=(66, 598, -60.6), on=['flutter']),
  dict(id='dangle', poly=[(42, 612), (152, 612), (152, 792), (42, 792)], exclude=[(-10, 708), (12, 716), (124, 512), (100, 500)], b='pendulum', pv=(66, 618), k=10, idle=.06, on=['wobble']),
  dict(id='pendant', box=(248, 418, 337, 657), b='pendulum', pv=(292, 424), k=14, idle=.05, on=['wobble']),
  dict(id='oyster', box=(433, 458, 737, 687), on=['pearl'], pearl=(562, 572), glint=(562, 572)),
  dict(id='lid', poly=[(584, 826), (868, 826), (868, 1049), (840, 1050), (810, 1050), (770, 1050), (730, 1052), (690, 1052), (650, 1049), (610, 1049), (586, 1044)], pv=(726, 1040), on=['lid']),
  dict(id='tin', poly=[(586, 1044), (610, 1049), (650, 1049), (690, 1052), (730, 1052), (770, 1050), (810, 1050), (840, 1050), (868, 1049), (868, 1148), (586, 1148)], pv=(726, 1140), on=['lid'], rim=(728, 1022, 138, 27)),
  dict(id='fan', box=(110, 760, 590, 1144), inkmin=.3, b='fan', pv=(470, 1122), a=(-172, -54), on=['fold']),
 ],
 # ------------------------------------------------------------- furniture: one room across both pages
 'fu': [
  dict(id='lamp', box=(173, 0, 752, 222), b='glow', glow=(668, 64, 330), parent='sofa', behind=True, on=['glow'], opaque=True,
       extra=[arc(659, 62, 56, 58, 180, 372, 40)]),
  dict(id='pillowL', box=(208, 183, 442, 362), parent='sofa', on=['color'], col=UPHOLSTERY[3:] + UPHOLSTERY[:3], opaque=True),
  dict(id='pillowR', box=(488, 153, 672, 317), parent='sofa', on=['color'], col=UPHOLSTERY[1:] + UPHOLSTERY[:1], opaque=True),
  dict(id='sofa', cmask=[(150, 420), (185, 250), (300, 215), (440, 215), (560, 190), (660, 240), (735, 300), (745, 430), (600, 470), (450, 515), (300, 568), (160, 575)],
       box=(123, 188, 752, 607), drag=True, z=600, pv=(440, 600), on=['color'], col=UPHOLSTERY, opaque=True),
  dict(id='table', box=(755, 252, 962, 526), drag=True, z=520, pv=(845, 505), opaque=True),
  dict(id='glass1', box=(348, 708, 422, 837), parent='stool', on=['clink'], opaque=True),
  dict(id='glass2', box=(538, 743, 612, 857), parent='stool', on=['clink'], opaque=True),
  dict(id='stool', cmask=[(300, 800), (400, 750), (560, 750), (650, 800), (680, 900), (640, 980), (670, 1080), (640, 1170), (520, 1205), (350, 1200), (290, 1130), (300, 1030), (275, 950), (290, 860)],
       box=(168, 703, 697, 1257), drag=True, z=1240, pv=(430, 1240), on=['color'], col=UPHOLSTERY[2:] + UPHOLSTERY[:2], opaque=True),
  dict(id='edge', box=(800, 1060, 899, 1220), remove=True),
  dict(id='plant', b='tree', poly=[(x + R, y) for x, y in [(30, 830), (70, 812), (132, 820), (152, 850), (122, 880), (102, 948), (64, 948), (54, 880), (24, 860)]], parent='table2', opaque=True),
  dict(id='table2', poly=[(x + R, y) for x, y in [(0, 874), (60, 871), (150, 877), (214, 892), (220, 925), (202, 950), (182, 962), (180, 1040), (206, 1060), (196, 1102), (0, 1102)]], drag=True, z=1100, pv=(R + 100, 1095), opaque=True),
  dict(id='chair', cmask=[(x + R, y) for x, y in [(230, 300), (300, 250), (400, 185), (560, 175), (690, 190), (705, 300), (700, 550), (600, 575), (420, 570), (300, 560), (240, 520)]],
       box=(R + 178, 163, R + 777, 707), drag=True, z=700, pv=(R + 470, 690), on=['color'], col=UPHOLSTERY[4:] + UPHOLSTERY[:4], opaque=True),
  dict(id='sofa2', cmask=[(x + R, y) for x, y in [(15, 860), (20, 800), (120, 760), (260, 725), (400, 745), (470, 790), (560, 760), (700, 742), (820, 790), (855, 880), (845, 1050), (800, 1120), (680, 1155), (540, 1160), (430, 1125), (360, 1070), (250, 1025), (120, 1012), (30, 985)]],
       poly=[(x + R, y) for x, y in [(0, 760), (120, 736), (300, 716), (520, 712), (720, 716), (880, 756), (892, 1212), (330, 1212), (150, 1120), (0, 1112)]], drag=True, z=1000, pv=(R + 540, 1190), on=['color'],
       col=UPHOLSTERY[1:] + UPHOLSTERY[:1], opaque=True,
       extra=[[(x + R, y) for x, y in [(16, 866), (9, 924), (27, 982), (82, 1010), (168, 1014), (226, 1004)]], [(x + R, y) for x, y in [(60, 905), (110, 930), (170, 945), (222, 948)]]]),
 ],
}
SPREAD_SRC = {'fu': ('furniture_L', 'furniture_R')}
SPREADS = [('ro_L', 'ro_R'), ('es_L', 'es_R'), ('sh_L', 'sh_R'), ('fu_L', 'fu_R')]
SOURCE = {'fr': 'france', 'es': 'spain', 'ro': 'rome', 'sh': 'shanghai', 'fu': 'furniture', 'cl': 'clothes'}
