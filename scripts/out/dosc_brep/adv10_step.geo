SetFactory("OpenCASCADE");
Geometry.Tolerance = 1e-6;

// ==================== CARTER : cône ∩ biseau ====================
Cone(1) = {0, 0, -244.000000000, 0, 0, 244.000000000, 17.500000000, 110.000000000};

// Esquisse du biseau dans le plan XZ, extrudée en Y (sketch + extrude).
Point(101) = {-107.500000000, -244.000000000, -244.000000000, 1};
Point(102) = {107.500000000, -244.000000000, -244.000000000, 1};
Point(103) = {15.000000000, -244.000000000, 0, 1};
Point(104) = {-15.000000000, -244.000000000, 0, 1};
Line(101) = {101, 102}; Line(102) = {102, 103};
Line(103) = {103, 104}; Line(104) = {104, 101};
Curve Loop(101) = {101, 102, 103, 104};
Plane Surface(101) = {101};
_eh[] = Extrude {0, 488.000000000, 0} { Surface{101}; };
BooleanIntersection(1000) = { Volume{1}; Delete; }{ Volume{_eh[1]}; Delete; };

// --- Congé sur l'arête de pli du carter ---
_hs() = Abs(Boundary{ Volume{1000}; });
_hc() = Unique(Abs(Boundary{ Surface{_hs()}; }));
_hn = 0;
For _hk In {0 : #_hc()-1}
  _hbb() = BoundingBox Curve{_hc(_hk)};
  If ((_hbb(5)-_hbb(2) > 0.01) && (_hbb(3)-_hbb(0) > 0.01))
    _hf[_hn] = _hc(_hk); _hn = _hn + 1;
  EndIf
EndFor
If (_hn > 0)
  Fillet{1000}{_hf()}{3.000000000}
EndIf
_hv() = Volume{:};
HV = _hv(0);

// ==================== CORPS INTERNE : cône ∩ biseau ====================
Cone(900) = {0, 0, -243.340540541, 0, 0, 243.340540541, 0.250000000, 92.500000000};

// Esquisse du corps : même biseau que le carter, offset à t/2 au lieu de i/2.
Point(201) = {-37.908515884, -244.000000000, -244.000000000, 1};
Point(202) = {37.908515884, -244.000000000, -244.000000000, 1};
Point(203) = {0.750000000, -244.000000000, 0, 1};
Point(204) = {-0.750000000, -244.000000000, 0, 1};
Line(201) = {201, 202}; Line(202) = {202, 203};
Line(203) = {203, 204}; Line(204) = {204, 201};
Curve Loop(201) = {201, 202, 203, 204};
Plane Surface(201) = {201};
_eb[] = Extrude {0, 488.000000000, 0} { Surface{201}; };
BooleanIntersection(2000) = { Volume{900}; Delete; }{ Volume{_eb[1]}; Delete; };

// --- Congé sur l'arête de pli du corps ---
_bs() = Abs(Boundary{ Volume{2000}; });
_bc() = Unique(Abs(Boundary{ Surface{_bs()}; }));
_bn = 0;
For _bk In {0 : #_bc()-1}
  _bbb() = BoundingBox Curve{_bc(_bk)};
  If ((_bbb(5)-_bbb(2) > 0.01) && (_bbb(3)-_bbb(0) > 0.01))
    _bf[_bn] = _bc(_bk); _bn = _bn + 1;
  EndIf
EndFor
If (_bn > 0)
  Fillet{2000}{_bf()}{0.450000000}
EndIf
_av() = Volume{:};
BV = _av(0);
For _k In {0 : #_av()-1}
  If (_av(_k) != HV)
    BV = _av(_k);
  EndIf
EndFor

// ==================== Parois du carter ====================
_hb() = Abs(Boundary{ Volume{HV}; });
Delete{ Volume{HV}; }
_ht = -1; _htz = 1e30;
_hm = -1; _hmz = -1e30;
For _k In {0 : #_hb()-1}
  _q() = BoundingBox Surface{_hb(_k)};
  If (_q(5) - _q(2) < 0.01)
    _zm = 0.5*(_q(5) + _q(2));
    If (_zm < _htz)
      _htz = _zm; _ht = _hb(_k);
    EndIf
    If (_zm > _hmz)
      _hmz = _zm; _hm = _hb(_k);
    EndIf
  EndIf
EndFor

// ---- Interface : paroi extrudée depuis la face de bouche + face plane ----
_ie[] = Extrude {0, 0, 30.000000000} { Surface{_hm}; };
Delete{ Volume{_ie[1]}; }
Delete{ Surface{_hm}; }

// ==================== Parois du corps interne ====================
_bb() = Abs(Boundary{ Volume{BV}; });
Delete{ Volume{BV}; }
