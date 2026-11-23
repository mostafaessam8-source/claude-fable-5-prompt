import re
def parse(path):
    raw=open(path,encoding='cp1252',errors='replace').read().split('\n')
    T={};cur=None;hdr=raw[0]
    for l in raw:
        l=l.rstrip('\r')
        if l.startswith('%T'): cur=l[3:]; T[cur]=dict(f=[],r=[])
        elif l.startswith('%F'): T[cur]['f']=l[3:].split('\t')
        elif l.startswith('%R'):
            v=l[3:].split('\t'); f=T[cur]['f']; v+=['']*(len(f)-len(v)); T[cur]['r'].append(dict(zip(f,v)))
    return hdr,T
