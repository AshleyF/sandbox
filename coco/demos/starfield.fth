( STARFIELD - Color Forth )
( Stars radiate from center )
( using SET and RESET words )
DECIMAL
15 CONSTANT #S
CREATE XP #S 2* ALLOT
CREATE YP #S 2* ALLOT
CREATE XD #S 2* ALLOT
CREATE YD #S 2* ALLOT
CREATE CO #S ALLOT
: 2@+ ( n a -- val ) SWAP 2* + @ ;
: 2!+ ( val n a -- ) SWAP 2* + ! ;
: 1@+ ( n a -- val ) + C@ ;
: 1!+ ( val n a -- ) + C! ;
: RR ( -- n ) RND ;
: ISTAR ( n -- )
  RR 199 MOD 100 - DUP * 100 /
  RR 199 MOD 100 - DUP * 100 /
  + 1 < IF DROP RECURSE EXIT THEN
  DUP 32 SWAP XP 2!+
  DUP 16 SWAP YP 2!+
  RR 199 MOD 100 - 3 * 100 /
  OVER XD 2!+
  RR 199 MOD 100 - 3 * 100 /
  OVER YD 2!+
  RR 8 MOD 1+ SWAP CO 1!+ ;
: IALL #S 0 DO I ISTAR LOOP ;
: ERAS ( n -- )
  DUP XP 2@+ 10 / 32 +
  SWAP YP 2@+ 10 / 16 +
  RESET ;
: MOVE ( n -- )
  DUP DUP XP 2@+ OVER XD 2@+ + OVER XP 2!+
  DUP DUP YP 2@+ OVER YD 2@+ + OVER YP 2!+
  DUP XP 2@+ 10 / 32 + DUP 0< SWAP 63 > OR
  OVER YP 2@+ 10 / 16 + DUP 0< SWAP 31 > OR
  OR IF DUP ISTAR THEN DROP ;
: DRAW ( n -- )
  DUP XP 2@+ 10 / 32 +
  OVER YP 2@+ 10 / 16 +
  ROT CO 1@+ SET ;
: STEP ( n -- ) DUP ERAS DUP MOVE DRAW ;
: GO
  CLS IALL
  BEGIN
    #S 0 DO I STEP LOOP
  ?TERMINAL UNTIL ;
GO
