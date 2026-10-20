// Sussex county qualifying standards, in seconds — copied verbatim (by script)
// from coach-tools-deploy/index.html. WCQT: ages 10..17+ (8 columns);
// LCCQT and LCCQTLC: ages 10..16+ (7 columns). null = no standard at that age.
export type Sex = "female" | "male";
export type CqtTable = Record<Sex, Record<string, (number | null)[]>>;

export const CQT_WCQT: CqtTable = {
  "female": {
    "50m Freestyle": [
      40,
      35,
      33,
      31,
      30,
      30,
      29,
      29
    ],
    "50m Backstroke": [
      45,
      41,
      38,
      36,
      35,
      34,
      34,
      34
    ],
    "50m Breaststroke": [
      52,
      47,
      43,
      41,
      40,
      39,
      38,
      38
    ],
    "50m Butterfly": [
      47,
      40,
      37,
      34,
      33,
      33,
      32,
      32
    ],
    "100m Freestyle": [
      88,
      80,
      72,
      67,
      65,
      64,
      63,
      63
    ],
    "100m Backstroke": [
      96,
      90,
      83,
      75,
      75,
      73,
      72,
      72
    ],
    "100m Breaststroke": [
      113,
      103,
      96,
      88,
      86,
      85,
      84,
      84
    ],
    "100m Butterfly": [
      105,
      96,
      86,
      78,
      75,
      74,
      73,
      73
    ],
    "100m Individual Medley": [
      97,
      89,
      84,
      77,
      75,
      74,
      72,
      72
    ],
    "200m Freestyle": [
      200,
      170,
      155,
      145,
      140,
      140,
      139,
      139
    ],
    "200m Backstroke": [
      205,
      188,
      175,
      165,
      160,
      158,
      155,
      155
    ],
    "200m Breaststroke": [
      235,
      225,
      209,
      188,
      187,
      180,
      180,
      180
    ],
    "200m Butterfly": [
      240,
      230,
      205,
      185,
      180,
      180,
      170,
      170
    ],
    "200m Individual Medley": [
      220,
      198,
      180,
      165,
      165,
      160,
      157,
      157
    ],
    "400m Individual Medley": [
      null,
      null,
      375,
      375,
      375,
      375,
      360,
      360
    ],
    "400m Freestyle": [
      330,
      330,
      330,
      330,
      310,
      310,
      300,
      300
    ],
    "800m Freestyle": [
      null,
      null,
      630,
      630,
      630,
      630,
      615,
      615
    ],
    "1500m Freestyle": [
      null,
      null,
      1260,
      1260,
      1260,
      1260,
      1230,
      1230
    ]
  },
  "male": {
    "50m Freestyle": [
      39,
      35,
      32,
      30,
      28,
      27,
      26,
      26
    ],
    "50m Backstroke": [
      46,
      41,
      37,
      36,
      34,
      32,
      31,
      31
    ],
    "50m Breaststroke": [
      52,
      49,
      44,
      40,
      38,
      36,
      34,
      34
    ],
    "50m Butterfly": [
      48,
      41,
      37,
      35,
      31,
      30,
      29,
      29
    ],
    "100m Freestyle": [
      86,
      80,
      71,
      67,
      62,
      60,
      57,
      56
    ],
    "100m Backstroke": [
      99,
      92,
      82,
      77,
      72,
      70,
      66,
      66
    ],
    "100m Breaststroke": [
      113,
      106,
      96,
      92,
      82,
      79,
      74,
      74
    ],
    "100m Butterfly": [
      115,
      101,
      89,
      82,
      74,
      70,
      65,
      63
    ],
    "100m Individual Medley": [
      97,
      90,
      81,
      79,
      72,
      70,
      66,
      65
    ],
    "200m Freestyle": [
      186,
      172,
      151,
      145,
      137,
      136,
      129,
      125
    ],
    "200m Backstroke": [
      213,
      195,
      173,
      170,
      160,
      155,
      150,
      145
    ],
    "200m Breaststroke": [
      240,
      235,
      200,
      190,
      180,
      175,
      180,
      165
    ],
    "200m Butterfly": [
      238,
      223,
      208,
      190,
      175,
      168,
      160,
      153
    ],
    "200m Individual Medley": [
      205,
      195,
      177,
      168,
      155,
      152,
      146,
      146
    ],
    "400m Individual Medley": [
      null,
      null,
      360,
      360,
      360,
      360,
      330,
      330
    ],
    "400m Freestyle": [
      330,
      330,
      330,
      330,
      300,
      300,
      285,
      285
    ],
    "800m Freestyle": [
      null,
      null,
      615,
      615,
      615,
      615,
      600,
      600
    ],
    "1500m Freestyle": [
      null,
      null,
      1215,
      1215,
      1215,
      1215,
      1170,
      1170
    ]
  }
};

export const CQT_LCCQT: CqtTable = {
  "female": {
    "50m Freestyle": [
      41.5,
      38.5,
      34.4,
      32.4,
      30.3,
      30.3,
      29.3
    ],
    "50m Backstroke": [
      59.6,
      44.6,
      40.5,
      38.5,
      35.4,
      35.4,
      33.4
    ],
    "50m Breaststroke": [
      55.4,
      50.4,
      46.3,
      43.3,
      40.2,
      40.2,
      39.2
    ],
    "50m Butterfly": [
      50.6,
      47.6,
      40.5,
      36.5,
      33.4,
      33.4,
      32.4
    ],
    "100m Freestyle": [
      94.1,
      86.0,
      76.9,
      70.8,
      66.8,
      64.7,
      64.7
    ],
    "100m Backstroke": [
      107.3,
      97.2,
      88.1,
      82.0,
      77.0,
      75.9,
      73.9
    ],
    "100m Breaststroke": [
      121.0,
      114.9,
      102.8,
      94.7,
      88.6,
      86.6,
      83.5
    ],
    "100m Butterfly": [
      139.5,
      121.4,
      101.2,
      90.2,
      80.1,
      77.0,
      76.0
    ],
    "200m Freestyle": [
      211.4,
      185.1,
      162.9,
      151.7,
      144.6,
      142.6,
      140.6
    ],
    "200m Backstroke": [
      225.5,
      205.4,
      180.2,
      171.1,
      163.0,
      162.0,
      157.9
    ],
    "200m Breaststroke": [
      256.9,
      227.7,
      213.5,
      200.4,
      189.2,
      186.2,
      182.1
    ],
    "200m Butterfly": [
      251.7,
      246.7,
      208.5,
      201.4,
      190.3,
      181.3,
      181.3
    ],
    "200m Individual Medley": [
      238.3,
      218.2,
      185.9,
      174.8,
      165.6,
      160.6,
      160.6
    ],
    "400m Individual Medley": [
      null,
      null,
      395.6,
      378.4,
      355.1,
      344.9,
      344.9
    ],
    "400m Freestyle": [
      441.8,
      406.5,
      361.1,
      335.8,
      305.4,
      300.4,
      295.3
    ],
    "800m Freestyle": [
      null,
      null,
      742.2,
      691.7,
      671.4,
      641.0,
      620.8
    ],
    "1500m Freestyle": [
      null,
      null,
      1380.1,
      1314.4,
      1273.9,
      1243.5,
      1233.4
    ]
  },
  "male": {
    "50m Freestyle": [
      42.5,
      37.4,
      35.4,
      31.3,
      30.3,
      28.3,
      26.2
    ],
    "50m Backstroke": [
      50.6,
      44.6,
      41.5,
      37.5,
      35.4,
      33.4,
      31.4
    ],
    "50m Breaststroke": [
      46.4,
      51.4,
      47.3,
      42.3,
      39.2,
      38.2,
      35.1
    ],
    "50m Butterfly": [
      50.6,
      46.6,
      39.5,
      36.5,
      34.5,
      31.4,
      30.4
    ],
    "100m Freestyle": [
      91.1,
      87.0,
      80.0,
      70.8,
      66.8,
      60.6,
      58.6
    ],
    "100m Backstroke": [
      106.2,
      100.2,
      90.1,
      79.0,
      75.9,
      72.9,
      67.8
    ],
    "100m Breaststroke": [
      119.9,
      116.9,
      105.8,
      92.6,
      87.6,
      83.5,
      78.4
    ],
    "100m Butterfly": [
      120.4,
      118.4,
      105.3,
      85.1,
      79.0,
      72.0,
      68.9
    ],
    "200m Freestyle": [
      201.3,
      186.1,
      160.9,
      151.7,
      143.6,
      138.5,
      132.4
    ],
    "200m Backstroke": [
      231.6,
      211.4,
      188.2,
      170.0,
      160.9,
      155.9,
      150.8
    ],
    "200m Breaststroke": [
      258.0,
      234.8,
      222.6,
      200.4,
      190.2,
      178.1,
      174.0
    ],
    "200m Butterfly": [
      251.7,
      245.7,
      221.6,
      201.4,
      180.3,
      166.1,
      160.0
    ],
    "200m Individual Medley": [
      231.3,
      202.1,
      184.9,
      170.7,
      165.6,
      150.4,
      148.4
    ],
    "400m Individual Medley": [
      null,
      null,
      400.6,
      375.0,
      360.1,
      339.9,
      329.7
    ],
    "400m Freestyle": [
      421.7,
      386.4,
      352.0,
      330.0,
      310.5,
      290.2,
      278.0
    ],
    "800m Freestyle": [
      null,
      null,
      752.3,
      630.0,
      661.3,
      630.9,
      600.4
    ],
    "1500m Freestyle": [
      null,
      null,
      1430.6,
      1263.8,
      1243.9,
      1183.5,
      1182.7
    ]
  }
};

export const CQT_LCCQTLC: CqtTable = {
  "female": {
    "50m Freestyle": [
      42.0,
      39.0,
      35.0,
      33.0,
      31.0,
      31.0,
      30.0
    ],
    "50m Backstroke": [
      50.0,
      45.0,
      41.0,
      39.0,
      36.0,
      36.0,
      34.0
    ],
    "50m Breaststroke": [
      56.0,
      51.0,
      47.0,
      44.0,
      41.0,
      41.0,
      40.0
    ],
    "50m Butterfly": [
      51.0,
      48.0,
      41.0,
      37.0,
      34.0,
      34.0,
      33.0
    ],
    "100m Freestyle": [
      95.0,
      87.0,
      78.0,
      72.0,
      68.0,
      66.0,
      66.0
    ],
    "100m Backstroke": [
      108.0,
      98.0,
      89.0,
      83.0,
      78.0,
      77.0,
      75.0
    ],
    "100m Breaststroke": [
      122.0,
      116.0,
      104.0,
      96.0,
      90.0,
      88.0,
      85.0
    ],
    "100m Butterfly": [
      140.0,
      122.0,
      102.0,
      91.0,
      81.0,
      78.0,
      77.0
    ],
    "200m Freestyle": [
      213.0,
      187.0,
      165.0,
      154.0,
      147.0,
      145.0,
      143.0
    ],
    "200m Backstroke": [
      227.0,
      207.0,
      182.0,
      173.0,
      165.0,
      165.0,
      160.0
    ],
    "200m Breaststroke": [
      259.0,
      230.0,
      216.0,
      203.0,
      192.0,
      189.0,
      185.0
    ],
    "200m Butterfly": [
      253.0,
      248.0,
      210.0,
      203.0,
      192.0,
      183.0,
      183.0
    ],
    "200m Individual Medley": [
      240.0,
      220.0,
      188.0,
      177.0,
      168.0,
      163.0,
      163.0
    ],
    "400m Individual Medley": [
      null,
      null,
      400.0,
      383.0,
      360.0,
      350.0,
      350.0
    ],
    "400m Freestyle": [
      445.0,
      410.0,
      365.0,
      340.0,
      310.0,
      305.0,
      300.0
    ],
    "800m Freestyle": [
      null,
      null,
      750.0,
      700.0,
      680.0,
      650.0,
      630.0
    ],
    "1500m Freestyle": [
      null,
      null,
      1395.0,
      1330.0,
      1290.0,
      1260.0,
      1250.0
    ]
  },
  "male": {
    "50m Freestyle": [
      43.0,
      38.0,
      36.0,
      32.0,
      31.0,
      29.0,
      27.0
    ],
    "50m Backstroke": [
      51.0,
      45.0,
      42.0,
      38.0,
      36.0,
      34.0,
      32.0
    ],
    "50m Breaststroke": [
      57.0,
      52.0,
      48.0,
      43.0,
      40.0,
      39.0,
      36.0
    ],
    "50m Butterfly": [
      51.0,
      47.0,
      40.0,
      37.0,
      35.0,
      32.0,
      31.0
    ],
    "100m Freestyle": [
      92.0,
      88.0,
      81.0,
      72.0,
      68.0,
      62.0,
      60.0
    ],
    "100m Backstroke": [
      107.0,
      101.0,
      91.0,
      80.0,
      77.0,
      74.0,
      69.0
    ],
    "100m Breaststroke": [
      121.0,
      118.0,
      107.0,
      94.0,
      89.0,
      85.0,
      80.0
    ],
    "100m Butterfly": [
      121.0,
      119.0,
      106.0,
      86.0,
      80.0,
      73.0,
      70.0
    ],
    "200m Freestyle": [
      203.0,
      188.0,
      163.0,
      154.0,
      146.0,
      141.0,
      135.0
    ],
    "200m Backstroke": [
      233.0,
      213.0,
      190.0,
      172.0,
      163.0,
      158.0,
      153.0
    ],
    "200m Breaststroke": [
      260.0,
      237.0,
      225.0,
      203.0,
      193.0,
      181.0,
      177.0
    ],
    "200m Butterfly": [
      253.0,
      247.0,
      223.0,
      203.0,
      182.0,
      168.0,
      162.0
    ],
    "200m Individual Medley": [
      233.0,
      204.0,
      187.0,
      173.0,
      168.0,
      153.0,
      151.0
    ],
    "400m Individual Medley": [
      null,
      null,
      405.0,
      380.0,
      365.0,
      345.0,
      335.0
    ],
    "400m Freestyle": [
      425.0,
      390.0,
      356.0,
      331.0,
      315.0,
      295.0,
      283.0
    ],
    "800m Freestyle": [
      null,
      null,
      760.0,
      690.0,
      670.0,
      640.0,
      610.0
    ],
    "1500m Freestyle": [
      null,
      null,
      1445.0,
      1360.0,
      1280.0,
      1260.0,
      1200.0
    ]
  }
};

const clampAge = (age: number, min: number, max: number) => Math.max(min, Math.min(max, age));
function cqtValue(table: CqtTable, sex: Sex, event: string, age: number, cols: 7 | 8): number | null {
  const arr = table[sex]?.[event];
  if (!arr) return null;
  const v = arr[clampAge(age, 10, cols === 8 ? 17 : 16) - 10];
  return v ?? null;
}
export type CqtFn = (sex: Sex, event: string, age: number) => number | null;
export const wcqtVal: CqtFn = (s, e, a) => cqtValue(CQT_WCQT, s, e, a, 8);
export const lccqtVal: CqtFn = (s, e, a) => cqtValue(CQT_LCCQT, s, e, a, 7);
export const lccqtlcVal: CqtFn = (s, e, a) => cqtValue(CQT_LCCQTLC, s, e, a, 7);
