(Test part: 100 x 60 bracket with a 20 mm hole - mm, absolute)
G21 G90
G0 Z10
(hole first)
G0 X30 Y30
M3 S1000
G1 Z-1 F500
G2 X30 Y30 I10 J0 F1500
M5
G0 Z10
(outside)
G0 X0 Y0
M3
G1 X100 Y0 F2000
G1 X100 Y60
G1 X0 Y60
G1 X0 Y0
M5
G0 Z10
M30
