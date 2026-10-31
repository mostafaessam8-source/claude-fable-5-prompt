"""Generates the B21 floor plan (DXF for AutoCAD + PDF/PNG preview) from the dimensions in the Mountain View / DMA plan.
Units: millimetres, 1 drawing unit = 1 mm. North is up (plan y = -z of the 3D model)."""
import re, math, ezdxf
from ezdxf.enums import TextEntityAlignment
from ezdxf import colors

SRC='mountain-view-b21-3d.html'
src=open(SRC).read()
T=150  # wall thickness mm
walls=[]
for m in re.finditer(r"^(?:wall\(.*\);?)+$",src,re.M):
    pass
for line in src.split('\n'):
    if not line.startswith('wall('): continue
    for call in re.findall(r"wall\(([^;]*?)\);(?=wall|$)|wall\((.*)\);$",line):
        pass
# robust parser: split on ';wall(' boundaries
chunks=[c for c in re.split(r";(?=wall\()",line.rstrip(';')) if c.startswith('wall(')]
walls=[]
for line in src.split('\n'):
    if not line.startswith('wall('): continue
    for c in re.split(r";(?=wall\()",line.rstrip(';')):
        mm=re.match(r"wall\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)(?:,\[(.*)\])?\)$",c.strip())
        x1,z1,x2,z2=map(float,mm.groups()[:4]); ops=[]
        if mm.group(5):
            for o in re.finditer(r"W\(([-\d.]+),([-\d.]+),'(\w+)'(?:,\{(.*?)\}\))?(?=,W\(|$)",mm.group(5)):
                a,b,k,extra=o.groups(); d=dict(kind=k,a=float(a),b=float(b))
                if extra:
                    h=re.search(r"hinge:'(\w)'",extra); i=re.search(r"into:(-?1)",extra); sl=re.search(r"sill:([\d.]+)",extra)
                    if h: d['hinge']=h.group(1)
                    if i: d['into']=int(i.group(1))
                    if sl: d['sill']=float(sl.group(1))
                ops.append(d)
        walls.append((x1,z1,x2,z2,ops))

P=lambda x,z:(x*1000,-z*1000)
doc=ezdxf.new('R2018',setup=True); doc.units=ezdxf.units.MM
msp=doc.modelspace()
L={'A-WALL':(7,0.5),'A-DOOR':(1,0.25),'A-GLAZ':(5,0.25),'A-FURN':(8,0.18),'A-ANNO-TEXT':(7,0.18),'A-ANNO-DIMS':(3,0.18),'A-AREA':(6,0.18),'A-TERR':(4,0.35),'A-HATCH':(252,0.09),'A-ANNO-TTLB':(7,0.5)}
for n,(c,w) in L.items():
    la=doc.layers.add(n,color=c); la.dxf.lineweight=int(w*100)
doc.styles.add('ARCH',font='arial.ttf')

def rect(cx,cy,w,d,rot=0):
    c,s=math.cos(rot),math.sin(rot); pts=[]
    for dx,dy in[(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]:
        pts.append((cx+dx*c-dy*s,cy+dx*s+dy*c))
    return pts
def furn(name,x,z,w,d,rot_deg=0):
    cx,cy=P(x,z); pts=rect(cx,cy,w*1000,d*1000,math.radians(-rot_deg))
    msp.add_lwpolyline(pts,close=True,dxfattribs={'layer':'A-FURN'})
    msp.add_text(name,height=70,dxfattribs={'layer':'A-FURN','style':'ARCH'}).set_placement((cx,cy),align=TextEntityAlignment.MIDDLE_CENTER)

# --- walls: solid pieces between openings
def solid(a,b,fixed,horiz):
    if b-a<1: return
    if horiz: pts=[(a,fixed-T/2),(b,fixed-T/2),(b,fixed+T/2),(a,fixed+T/2)]
    else: pts=[(fixed-T/2,a),(fixed+T/2,a),(fixed+T/2,b),(fixed-T/2,b)]
    msp.add_lwpolyline(pts,close=True,dxfattribs={'layer':'A-WALL'})
    h=msp.add_hatch(color=252,dxfattribs={'layer':'A-HATCH'}); h.paths.add_polyline_path(pts,is_closed=True)
    h.set_pattern_fill('ANSI31',scale=25)
for x1,z1,x2,z2,ops in walls:
    horiz=abs(z1-z2)<1e-9
    if horiz: a0,b0,fz=min(x1,x2),max(x1,x2),z1
    else: a0,b0,fz=min(z1,z2),max(z1,z2),x1
    # model axis -> drawing mm; vertical walls: model z -> drawing y = -z
    cur=a0-T/2000
    for o in sorted(ops,key=lambda d:d['a']):
        s,e=(cur,o['a'])
        if horiz: solid(s*1000,e*1000,-fz*1000,True)
        else: solid(-e*1000,-s*1000,fz*1000,False)
        cur=o['b']
        mid=(o['a']+o['b'])/2;w=(o['b']-o['a'])*1000
        if horiz: c0=(o['a']*1000,-fz*1000);c1=(o['b']*1000,-fz*1000)
        else: c0=(fz*1000,-o['a']*1000);c1=(fz*1000,-o['b']*1000)
        k=o['kind']
        def ln(p,q,layer): msp.add_line(p,q,dxfattribs={'layer':layer})
        # jamb lines
        for p in (c0,c1):
            if horiz: ln((p[0],p[1]-T/2),(p[0],p[1]+T/2),'A-WALL')
            else: ln((p[0]-T/2,p[1]),(p[0]+T/2,p[1]),'A-WALL')
        if k in('win','slide'):
            for off in(-T/2,0,T/2):
                if horiz: ln((c0[0],c0[1]+off),(c1[0],c1[1]+off),'A-GLAZ')
                else: ln((c0[0]+off,c0[1]),(c1[0]+off,c1[1]),'A-GLAZ')
        elif k=='arch':
            for off in(-T/2,T/2):
                msp.add_line((c0[0]+(0 if horiz else off),c0[1]+(off if horiz else 0)),(c1[0]+(0 if horiz else off),c1[1]+(off if horiz else 0)),dxfattribs={'layer':'A-WALL','linetype':'DASHED'})
        elif k in('door','front'):
            into=o.get('into',1); hinge=o.get('hinge','a')
            hp,fp=(c0,c1) if hinge=='a' else (c1,c0)
            # leaf opens 90deg into the room on side 'into' (model +z=south => drawing -y)
            if horiz: nrm=(0,-into)
            else: nrm=(into,0)
            tip=(hp[0]+nrm[0]*w,hp[1]+nrm[1]*w)
            ln(hp,tip,'A-DOOR')
            a_h=math.degrees(math.atan2(tip[1]-hp[1],tip[0]-hp[0]));a_f=math.degrees(math.atan2(fp[1]-hp[1],fp[0]-hp[0]))
            d=(a_f-a_h+540)%360-180
            s_,e_=(a_h,a_h+d) if d>0 else (a_h+d,a_h)
            msp.add_arc(hp,w,s_,e_,dxfattribs={'layer':'A-DOOR'})
    s,e=cur,b0+T/2000
    if horiz: solid(s*1000,e*1000,-fz*1000,True)
    else: solid(-e*1000,-s*1000,fz*1000,False)
# --- terrace glass balustrade
for p,q in[((0,6.7),(6.86,6.7)),((6.86,5.4),(6.86,6.7))]:
    a,b=P(*p),P(*q); msp.add_line(a,b,dxfattribs={'layer':'A-TERR'}); msp.add_line((a[0],a[1]+(40 if a[1]==b[1] else 0)),(b[0],b[1]+(40 if a[1]==b[1] else 0)),dxfattribs={'layer':'A-TERR'})
msp.add_line(P(0,5.4),P(0,6.7),dxfattribs={'layer':'A-TERR'})
# --- rooms: labels and official areas (DMA table)
rooms={'RECEPTION / SALON':((-4.55,0,1.2,7.3),'6.10 x 4.55',27.04),'ENTRANCE':((-2.45,0,-1.4,1.2),'2.45 x 2.60',6.29),'CORRIDOR':((0,7.8,0,1.2),'1.20 x 7.55',9.06),
 'G. TOILET':((0,1.55,-2.5,0),'2.50 x 1.55',3.87),'KITCHEN':((1.55,5.8,-2.5,0),'2.50 x 4.25',10.63),'BATHROOM':((5.8,8.8,-2.5,0),'2.50 x 3.00',7.50),
 'M. DRESSING':((8.8,10.85,-2.5,0),'2.05 x 2.55',5.22),'M. BATHROOM':((8.8,10.65,-5.1,-2.5),'1.85 x 2.60',4.79),'LIVING ROOM (BEDROOM 01)':((0,3.8,1.2,5.4),'4.15 x 3.80',15.77),
 'BEDROOM 02':((3.8,7.8,1.2,5.4),'4.25 x 3.95',16.01),'M. BEDROOM':((7.8,12.2,0,3.85),'4.40 x 3.85',16.92),'TERRACE':((0,6.86,5.4,6.7),'1.30 x 6.86',8.91)}
for n,((x0,x1,z0,z1),dim,area) in rooms.items():
    cx,cy=P((x0+x1)/2,(z0+z1)/2)
    for i,(t,h) in enumerate([(n,130),(dim+' m',90),('%.2f m2'%area,90)]):
        msp.add_text(t,height=h,dxfattribs={'layer':'A-AREA' if i else 'A-ANNO-TEXT','style':'ARCH'}).set_placement((cx,cy+170-i*150),align=TextEntityAlignment.MIDDLE_CENTER)
# --- furniture layout (as in the 3D model)
F=[('SOFA 3S',-3.8,3.75,.95,2.6,0),('SOFA 2S',-3.0,1.8,1.7,.9,0),('ARMCHAIR',-1.6,3.0,1.0,.95,0),('ARMCHAIR',-1.55,4.6,1.0,.95,0),('COFFEE TBL',-2.45,3.7,1.2,.7,90),('TV UNIT 75"',-.285,3.7,.45,2.2,0),
 ('DINING 8P',-2.4,6.2,2.0,1.0,0),('SIDEBOARD',-4.2,5.9,.45,.45,0),
 ('SECTIONAL',3.3,3.4,.98,2.4,0),('TV UNIT',.285,3.4,.45,2.3,0),('COFFEE',1.5,2.9,.9,.9,0),
 ('BED 1.5',6.55,3.3,2.0,1.5,0),('WARDROBE',4.175,3.95,.6,2.3,0),
 ('BED 1.8',9.0,2.35,2.05,1.8,0),('BENCH',10.5,2.35,.45,1.5,0),('VANITY TBL',12.0,2.5,.45,1.2,0),('CHEST',11.4,.33,1.4,.5,0),
 ('KITCHEN RUN',3.675,-2.125,4.08,.6,0),('HOB UNIT',5.44,-1.3,.6,1.2,0),('FRIDGE',4.72,-.4,.78,.7,0),
 ('JACUZZI',8.3,-1.3,.9,1.7,0),('VANITY',6.14,-1.3,.5,1.3,0),('WC',7.0,-2.11,.45,.6,0),
 ('WC',.78,-2.11,.45,.6,0),('VANITY',1.225,-1.65,.5,.8,0),('WARDROBE',9.155,-1.45,.56,1.2,0),('WARDROBE',10.495,-1.45,.56,1.2,0),
 ('JACUZZI',9.725,-4.49,1.55,.95,0),('WC',10.27,-3.6,.6,.45,0),('VANITY',9.14,-3.55,.5,.9,0),('BENCH',2.2,6.45,2.6,.4,0),('EGG CHAIR',6.2,6.05,.9,.9,0)]
for n,x,z,w,d,r in F: furn(n,x,z,w,d,r)
# --- dimensions (mm) - outer chains and room sizes
def dim(p1,p2,base,vertical=False):
    if not isinstance(base,tuple): base=(p1[0],base)
    d=msp.add_linear_dim(base=base,p1=p1,p2=p2,angle=90 if vertical else 0,dimstyle='EZDXF',dxfattribs={'layer':'A-ANNO-DIMS'}); d.render()
doc.dimstyles.get('EZDXF').dxf.dimtxt=110; doc.dimstyles.get('EZDXF').dxf.dimasz=90; doc.dimstyles.get('EZDXF').dxf.dimexe=60; doc.dimstyles.get('EZDXF').dxf.dimexo=60
S=P
dim(S(-4.55,7.3),S(0,7.3),S(0,7.3)[1]-900)           # reception width
dim(S(0,7.3),S(6.86,7.3),S(0,7.3)[1]-900)            # terrace length
dim(S(-4.55,7.3),S(6.86,7.3),S(0,7.3)[1]-1500)
dim(S(7.8,3.85),S(12.2,3.85),S(0,3.85)[1]-900)       # master width
dim(S(-4.55,7.3),S(-4.55,1.2),(S(-4.55,0)[0]-900,0),vertical=True)
dim(S(-4.55,1.2),S(-4.55,-1.4),(S(-4.55,0)[0]-900,0),vertical=True)
dim(S(12.2,3.85),S(12.2,-5.1),(S(12.2,0)[0]+900,0),vertical=True)
dim(S(12.2,3.85),S(12.2,0),(S(12.2,0)[0]+900,0),vertical=True)
dim(S(0,5.4),S(0,1.2),(S(0,0)[0]-300,0),vertical=True)
dim(S(0,-2.5),S(1.55,-2.5),S(0,-2.5)[1]+800)
dim(S(1.55,-2.5),S(5.8,-2.5),S(0,-2.5)[1]+800)
dim(S(5.8,-2.5),S(8.8,-2.5),S(0,-2.5)[1]+800)
dim(S(8.8,-5.1),S(10.65,-5.1),S(0,-5.1)[1]+800)
# --- title block (A3, scale 1:50 -> frame in mm of paper*50)
x0,y0=-8000,-9400; w,h=24500,19500
msp.add_lwpolyline([(x0,y0),(x0+w,y0),(x0+w,y0+h),(x0,y0+h)],close=True,dxfattribs={'layer':'A-ANNO-TTLB'})
tb=[(x0+w-8000,y0),(x0+w,y0),(x0+w,y0+3600),(x0+w-8000,y0+3600)]
msp.add_lwpolyline(tb,close=True,dxfattribs={'layer':'A-ANNO-TTLB'})
rows=['PROJECT: LAGOON BEACH PARK','UNIT: B21  -  I VILLA BEACH EDITION B','FLOOR: SECOND   GROSS AREA: 165.00 m2','DRAWING: FLOOR PLAN + FURNITURE LAYOUT','SCALE 1:50   UNITS: mm','Dimensions per developer (DMA) plan; measured to structure,','excluding wall finishes. Openings may vary per final drawings.']
for i,t in enumerate(rows):
    msp.add_text(t,height=170 if i<4 else 120,dxfattribs={'layer':'A-ANNO-TTLB','style':'ARCH'}).set_placement((x0+w-7800,y0+3300-i*430))
msp.add_text('N',height=350,dxfattribs={'layer':'A-ANNO-TTLB'}).set_placement((x0+w-2500,y0+h-1100))
msp.add_line((x0+w-2350,y0+h-700),(x0+w-2350,y0+h-1900),dxfattribs={'layer':'A-ANNO-TTLB'})
doc.saveas('drawings/B21_floor_plan.dxf')
print('dxf ok',len(walls),'wall runs')
# --- PDF/PNG preview
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.addons.drawing.config import Configuration, BackgroundPolicy, ColorPolicy
fig=plt.figure(figsize=(16.54,11.69)); ax=fig.add_axes([0,0,1,1])
cfg=Configuration(background_policy=BackgroundPolicy.WHITE,color_policy=ColorPolicy.BLACK)
Frontend(RenderContext(doc),MatplotlibBackend(ax),config=cfg).draw_layout(msp)
ax.set_xlim(x0-300,x0+w+300); ax.set_ylim(y0-300,y0+h+300); ax.set_aspect('equal')
fig.savefig('drawings/B21_floor_plan.pdf'); fig.savefig('drawings/B21_floor_plan.png',dpi=110)
print('pdf ok')
