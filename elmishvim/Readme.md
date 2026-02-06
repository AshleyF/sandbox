# Experiments in Vim Emulation

This is a Vim emulator in F#, compiled to JavaScript using Fable and using my own Elmish-like (Elmishish) MVU system. It's purely functional and is becomming a great way to document keybindings and behavior. Perhaps, in the future, it can serve as an instructional demo site.

## Key Bindings

### Motions

| Keys | Binding |
| --- | --- |
| `h` `<Left>` `<BS>` | Move to previous char. |
| `l` `<Right>` `<Space>` | Move to next char. |
| `k` `<Up>` | Move to previous line. |
| `j` `<Down>` | Move to next line. |
| `w` `<SRight>` | Move to start of next word. |
| `W` | Move to start of next WORD. |
| `b` `<SLeft>` | Move to start of previous word. |
| `B` | Move to start of previous WORD. |
| `e` | Move to end of next word. |
| `E` | Move to end of next WORD. |
| `ge` | Back end of word | Move to end of previous word. |
| `gE` | Back end of WORD | Move to end of previous WORD. |
| `0` | Move to column zero. |
| `^` | Move to start of line. |
| `$` | Move to end of line. |
| `f{char}` | Find | Move to next occurrance of char in line. |
| `F{char}` | Find reverse | Move to previous occurance of char in line. |
| `t{char}` | To | Move to just before next occurrance of char in line. |
| `T{char}` | To reverse | Move to just after previous occurrance of char in line. |
| `)` | Move to next sentence. |
| `(` | Move to previous sentence. |
| `}` | Move to next paragraph. |
| `{` | Move to previous paragraph. |
| `gg` | Move to top of document. |
| `G` | Move to bottom of document (or to line given number prefix). |

## Operations

| Keys | Binding |
| --- | --- |
| `c{motion}` | Change {motion}, delete and go to Insert mode. |
| `cc` `S` | Change line, delete and go to Insert mode. |
| `C` | Change to end line, delete and go to Insert mode. |
| `d{motion}` | Delete {motion}, delete remain in Normal mode. |
| `dd` | Delete line, delete remain in Normal mode. |
| `y{motion}` | Yank {motion}. |
| `yy` `Y` | Yank line. |
| `>{motion}` | Indent {motion}. |
| `<{motion}` | Unindent {motion}. |
| `r{char}` | Replace with {char}. |
| `i` | Insert before cursor (Insert mode). |
| `I` | Insert before line (Insert mode). |
| `a` | Insert after cursor (Insert mode). |
| `A` | Insert after line (Insert mode). |
| `x` | Delete under cursor. |
| `X` | Delete before cursor. |
| `p` | Put after cursor. |
| `P` | Put before cursor. |
| `.` | Repeat action. |
| `o` | Open line below. |
| `O` | Open line above.
| `v` | Visual mode. |
| `V` | Visual line mode. |
| `gv` | Reselect visual mode. |
| `<C-v>` | Visual block mode. |
| `/{pattern}<Enter>` | Search forward for pattern. |
| `?{pattern}<Enter>` | Search backward for pattern. | 
| `n` | Next match. |
| `N` | Previous match. |
| `u` | Undo. |
| `U` | Undo line. |
| `J` | Join line below. |
| `<C-r>` | Redo. |
| `<C-y>` | Scroll down line. |
| `<C-e>` | Scroll up line. |
| `<C-d>` | Scroll down half screen. |
| `<C-u>` | Scroll up half screen. |
| `<C-f>` | Scroll forward one screen. |
| `<C-b>` | Scroll back one creen. |
| `<Esc>` `<C-[>` | Reset pending and state. |

## Insert Mode

| `<Esc>` `<C-[>` | Escape back to Normal mode. |

CTRL-V {char}.. insert character literally, or enter decimal byte value 
NL or CR or CTRL-M or CTRL-J begin new line CTRL-M and CTRL-J are not supported
CTRL-E insert the character from below the cursor 
CTRL-Y insert the character from above the cursor 
CTRL-A insert previously inserted text We apply previously document change made in previous Insert session and we only apply changes that happen under cursor
CTRL-@ insert previously inserted text and stop Insert mode As above
CTRL-R {0-9a-z%#:.-="} insert the contents of a register 
CTRL-N insert next match of identifier before the cursor 
CTRL-P insert previous match of identifier before the cursor 
CTRL-X ... complete the word before the cursor in various ways 
BS or CTRL-H delete the character before the cursor 
Del delete the character under the cursor 
CTRL-W delete word before the cursor 
CTRL-U delete all entered characters in the current line 
CTRL-T insert one shiftwidth of indent in front of the current line 
CTRL-D delete one shiftwidth of indent in front of the current line 
0 CTRL-D delete all indent in the current line 
^ CTRL-D delete all indent in the current line, restore indent in next line

## Visual Mode

| `<Esc>` `<C-[>` | Escape back to Normal mode. |

o exchange cursor position with start of highlighting

u Lowercase
U Uppercase
J Join selected.

## Notes

- Change operation deletes deleted text to register.
- Change line (`cc`) doesn't include leading space

# TODO

gJ Join without adding space.
gt - Go to the next tab
gT - Go to the previous tab
:vsp - Vertically split windows
ctrl+ws - Split windows horizontally
ctrl+wv - Split windows vertically
ctrl+ww - Switch between windows
ctrl+wq - Quit a window
m{a-z} - Set mark {a-z} at cursor position
A capital mark {A-Z} sets a global mark and will work between files
'{a-z} - Move the cursor to the start of the line where the mark was set
'' - Go back to the previous jump location

"*y copy a selection to the system clipboard
"*p paste from the system clipboard
"+y copy a selection to the system clipboard
"+p paste from the system clipboard

:qa - Quit all open buffers
:wa - Write all open buffers
:wqa - Write and quit all open buffers

Ctrl+r + 0 in insert mode inserts the last yanked text (or in command mode)
% - jumps between matching () or {}

g0 g^ g$ same as without g, but working with *screen* lines (different when wrapping).
gk Move up *screen* line.
gj Move down *screen* line.

gm Middle of screen line.

| Move to column.

- Up line (to first non-blank char).
+ Down line (to first non-blank char).

]] N sections forward, at start of section
[[ N sections backward, at start of section
][ N sections forward, at end of section
[] N sections backward, at end of section
[( N times back to unclosed '('
[{ N times back to unclosed '{'
[m N times back to start of method (for Java)
[M N times back to end of method (for Java)
]) N times forward to unclosed ')'
]} N times forward to unclosed '}'
]m N times forward to start of method (for Java)
]M N times forward to end of method (for Java)
[# N times back to unclosed "#if" or "#else"
]# N times forward to unclosed "#else" or "#endif"
[* N times back to start of a C comment "/*"
]* N times forward to end of a C comment "*/"

/<CR> repeat last search, in the forward direction {count} is not supported.
?<CR> repeat last search, in the backward direction {count} is not supported.

* search forward for the identifier under the cursor 
# search backward for the identifier under the cursor 
g* like "*", but also find partial matches 
g# like "#", but also find partial matches 
d goto local declaration of identifier under the cursor 
gD goto global declaration of identifier under the cursor

m{a-zA-Z} mark current position with mark {a-zA-Z}
`{a-z} go to mark {a-z} within current file
`{A-Z} go to mark {A-Z} in any file
`{0-9} go to the position where Vim was previously exited

`` go to the position before the last jump
`" go to the position when last editing this file
`[ go to the start of the previously operated or put text
'[ go to the start of the previously operated or put text
`] go to the end of the previously operated or put text
'] go to the end of the previously operated or put text
`< go to the start of the (previous) Visual area
`> go to the end of the (previous) Visual area
`. go to the position of the last change in this file
'. go to the position of the last change in this file
'{a-zA-Z0-9[]'"<>.} same as `, but on the first non-blank in the line
:marks print the active marks

CTRL-O go to Nth older position in jump list
CTRL-I go to Nth newer position in jump list
:ju[mps] print the jump list

% find the next brace, bracket, comment, or "#if"/ "#else"/"#endif" in this line and go to its match
H go to the Nth line in the window, on the first non-blank
M go to the middle line in the window, on the first non-blank
L go to the Nth line from the bottom, on the first non-blank
go go to Nth byte in the buffer
:[range]go[to][off] go to [off] byte in the buffer

zt z<Enter> Zoom top.
zz z. Zoom middle.
zb z- Zoom bottom.

zh scroll screen N characters to the right In Code, the cursor will always move when you run this command, whether the horizontal scrollbar moves or not.
zl scroll screen N characters to the left As above
zH scroll screen half a screenwidth to the right As above
zL scroll screen half a screenwidth to the left As above

gi Insert where last insert stopped.
gI Insert at column one (not first non-blank, like I does)

"{char} use register {char} for the next delete, yank, or put
"* use register * to access system clipboard
:reg show the contents of all registers
:reg {arg} show the contents of registers mentioned in {arg}
y{motion} yank the text moved over with {motion} into a register
{visual}y yank the highlighted text into a register
]p like p, but adjust indent to current line
[p like P, but adjust indent to current line
gp like p, but leave cursor after the new text
gP like P, but leave cursor after the new text

r{char} replace N characters with {char} 
gr{char} replace N characters without affecting layout 
R enter Replace mode (repeat the entered text N times) {count} is not supported
gR enter virtual Replace mode: Like Replace mode but without affecting layout 
{visual}r{char} in Visual block, visual, or visual line modes: Replace each char of the selected text with {char}

s Substitute

g~{motion} switch case for the text that is moved over with {motion}
gu{motion} make the text that is moved over with {motion} lowercase
gU{motion} make the text that is moved over with {motion} uppercase

CTRL-A add N to the number at or after the cursor
CTRL-X subtract N from the number at or after the cursor

!{motion}{command}<CR> filter the lines that are moved over through {command} 
!!{command}<CR> filter N lines through {command} 
{visual}!{command}<CR> filter the highlighted lines through {command} 
:[range]! {command}<CR> filter [range] lines through {command} 

={motion} filter the lines that are moved over through 'equalprg' 
== filter N lines through 'equalprg' 
{visual}= filter the highlighted lines through 'equalprg' 

& Repeat previous ":s" on current line without options

. repeat last change (with count replaced with N) Content changes that don't happen under cursor can not be repeated.
q{a-z} record typed characters into register {a-z} 
q{A-Z} record typed characters, appended to register {a-z} 
q stop recording 

@{a-z} execute the contents of register {a-z} (N times) 
@@ repeat previous @{a-z} (N times) 
:@{a-z} execute the contents of register {a-z} as an Ex command 
:@@ repeat previous :@{a-z} 

:[range]g[lobal]/{pattern}/[cmd] execute Ex command cmd on the lines within [range] where {pattern} matches 
:[range]g[lobal]!/{pattern}/[cmd] execute Ex command cmd on the lines within [range] where {pattern} does NOT match 
:so[urce] {file} read Ex commands from {file} 
:so[urce]! {file} read Vim commands from {file} 

:sl[eep][sec] don't do anything for [sec] seconds 
gs goto Sleep for N seconds

## Text Objects

aw aW – a word/WORD (includes surrounding white space)
iw iW – inner word/WORD (does not include surrounding white space)
as – a sentence
is – inner sentence
ap – a paragraph
ip – inner paragraph
i" a"
i' a"
i` a`
ab ib i) a) i( a( - block
i] a] i[ a[
aB iB i} a} i{ a{
i> a> i< a<
it at - tag
ia aa Argument

## Insert Mode

<C-o> Normal mode for one action.

## Extra

`set -o vi`

## "Phrases"

`xp` Swap characters
`deep` Swap words (starting on space before)
`dwwP` Swap words
`ddp` Swap lines

## Links

https://github.com/VSCodeVim/Vim/blob/master/ROADMAP.md

## Lessons

### 

* Insert/Normal (<Esc>)
* `vi foo.txt`
* `:q!` `:wq` `:q`
* `:s/old/new/g` (`.../gc`)
* `:!command`
* `:w bar.txt`
* `:r foo.txt` `:r !ls`
* `:set ic` `:set noic`
* `:set is` `:set nois`
* `:set hls` `:set nohls`
* `:help foo` `:h foo`
* `~/.vimrc`
* Counts

## ABCs

** `a`         After
 * `b`         Back
** `c{motion}` Change
 * `cc`        Change line
** `d{motion}` Delete
** `dd`        Delete line
** `e`         End
 * `f{char}`   Find
 * `g{combo}`
 * `gg`        Top of document
** `h`         Left
** `i`         Insert
** `j`         Down
** `k`         Up
** `l`         Right
 * `m{char}`   Mark
** `n`         Next
** `o`         Open
** `p`         Put
 * `q{char}`   Record
** `r`         Replace
 * `s`         Substitute
 * `t{char}`   To
** `u`         Undo
** `v`         Visual
** `w`         Word
** `x`         Delete char
** `y{motion}` Yank
** `yy`        Yank line
   `z{combo}`
 * `zz`        Scroll center
   
** `A`         After line
 * `B`         Back WORD
 * `C`         Change to end of line
 * `D`         Delete to end of line
 * `E`         End WORD
 * `F`         Find previous
** `G`         Goto line
 * `H`         Top (highest) line (or n-lines from top)
 * `I`         Insert after line
 * `J`         Join lines
   `K`         Lookup keyword
 * `L`         Bottom (lowest) line (or n-lines from bottom)
 * `M`         Middle line
** `N`         Next reverse
** `O`         Open line above
 * `P`         Put before
   `Q`         Ex mode
** `R`         Replace mode 
 * `S`         Substitute line
 * `T`         To previous
** `U`         Undo line
 * `V`         Visual line mode
 * `W`         WORD
 * `X`         Delete previous char
 * `Y`         Yank line
   `ZZ`        Write and close (same as :x or :wq)
   `ZQ`        Quit without saving
   
   `g#`             Like "#", but without using "\<" and "\>"
   `g$`             When 'wrap' off go to rightmost character of the current line that is on the screen.
   `g&`             Repeat last ":s" on all lines
   `g'{mark}`       Like |'| but without changing the jumplist
   `g``{mark}`       Like |`| but without changing the jumplist
   `g*`             Like "*", but without using "\<" and "\>"
   `g+`             To newer text state N times
   `g,`             Go to N newer position in change list
   `g-`             Go to older text state N times
   `g0`             When 'wrap' off go to leftmost character of the current line that is on the screen
   `g8`             Print hex value of bytes used in UTF-8 character under the cursor
   `g;`             Go to N older position in change list
   `g<`             Display previous command output
   `g?`             Rot13 encoding operator
   `g??`            Rot13 encode current line
   `g?g?`           Rot13 encode current line
   `gD`             Go to definition of word under the cursor in current file
 * `gE`             Go backwards to the end of the previous WORD
   `gH`             Start Select line mode
 * `gI`             Like "I", but always start in column 1
 * `gJ`             Join lines without inserting space
   `gN`             Find the previous match with the last used search pattern and Visually select it
   `["x]gP`         Put the text [from register x] before the cursor N times, leave the cursor after it
   `gQ`             Switch to "Ex" mode with Vim editing
   `gR`             Enter Virtual Replace mode
 * `gT`             Go to the previous tab page
 * `gU{motion}`     Make Nmove text uppercase
   `gV`             Don't reselect the previous Visual area when executing a mapping or menu in Select mode
   `g]`             Select on the tag under the cursor
   `g^`             When 'wrap' off go to leftmost non-white character of the current line that is on the screen
   `g_`             Cursor to the last CHAR N - 1 lines lower
   `ga`             Print ascii value of character under the cursor
 * `gd`             Go to definition of word under the cursor in current function
 * `ge`             Go backwards to the end of the previous word
 * `gf`             Editing the file whose name is under the cursor
   `gF`	         Start editing the file whose name is under the cursor and jump to the line number following.
** `gg`	         Cursor to line N, default first line
   `gh`	         Start Select mode
   `gi`	         Like "i", but first move to the |'^| mark
   `gj`	         Like "j", but when 'wrap' on go N screen lines down
   `gk`	         Like "k", but when 'wrap' on go N screen lines up
 * `gm`	         Go to character at middle of the screenline
 * `gM`	         Go to character at middle of the text line
   `gn`	         Find the next match with the last used search pattern and Visually select it
   `go`	         Cursor to byte N in the buffer
   `["x]gp`         Put the text [from register x] after the cursor N times, leave the cursor after it
   `gq{motion}`     Format Nmove text
   `gr{char}`       Virtual replace N chars with {char}
   `gs`             Go to sleep for N seconds (default 1)
   `gt`             Go to the next tab page
 * `gu{motion}`     Make Nmove text lowercase
 * `gv`             Reselect the previous Visual area
   `gw{motion}`     Format Nmove text and keep cursor
 * `gx`             Execute application for file name under the cursor (only with |netrw| plugin)
   `g@{motion}`     Call 'operatorfunc'
 * `g~{motion}`     Swap case for Nmove text
   `g<Down>`        Same as "gj"
   `g<End>`         Same as "g$"
   `g<Home>`        Same as "g0"
   `g<LeftMouse>`   Same as <C-LeftMouse> g<MiddleMouse>	   same as <C-MiddleMouse>
   `g<RightMouse>`  Same as <C-RightMouse>
   `g<Tab>`         Go to the last accessed tab page.
   `g<Up>`          Same as "gk"
   
   `z<CR>`          Redraw, cursor line to top of window, cursor on first non-blank
   `z{height}<CR>`  Redraw, make window {height} lines high
   `z+`             Cursor on line N (default line below window), otherwise like "z<CR>"
   `z-`             Redraw, cursor line at bottom of window, cursor on first non-blank
   `z.`             Redraw, cursor line to center of window, cursor on first non-blank
   `z=`             Give spelling suggestions
   `zA`             Open a closed fold or close an open fold recursively
   `zC`             Close folds recursively
   `zD`             Delete folds recursively
   `zE`             Eliminate all folds
   `zF`             Create a fold for N lines
   `zG`             Temporarily mark word as correctly spelled
   `zH`             When 'wrap' off scroll half a screenwidth to the right
   `zL`             When 'wrap' off scroll half a screenwidth to the left
   `zM`             Set 'foldlevel' to zero
   `zN`             Set 'foldenable'
   `zO`             Open folds recursively
   `zR`             Set 'foldlevel' to the deepest fold
   `zW`             Temporarily mark word as incorrectly spelled
   `zX`             Re-apply 'foldlevel'
   `z^`             Cursor on line N (default line above window), otherwise like "z-"
   `za`             Open a closed fold, close an open fold
 * `zb`             Redraw, cursor line at bottom of window
   `zc`             Close a fold
   `zd`             Delete a fold
   `ze`             When 'wrap' off scroll horizontally to position the cursor at the end (right side) of the screen
   `zf{motion}`     Create a fold for Nmove text
   `zg`             Permanently mark word as correctly spelled
   `zh`             When 'wrap' off scroll screen N characters to the right
   `zi`             Toggle 'foldenable'
   `zj`             Move to the start of the next fold
   `zk`             Move to the end of the previous fold
   `zl`             When 'wrap' off scroll screen N characters to the left
   `zm`             Subtract one from 'foldlevel'
   `zn`             Reset 'foldenable'
   `zo`             Open fold
   `zp`             Paste in block-mode without trailing spaces
   `zP`             Paste in block-mode without trailing spaces
   `zr`             Add one to 'foldlevel'
   `zs`             When 'wrap' off scroll horizontally to position the cursor at the start (left side) of the screen
 * `zt`             Redraw, cursor line at top of window
   `zuw`            Undo |zw|
   `zug`            Undo |zg|
   `zuW`            Undo |zW|
   `zuG`            Undo |zG|
   `zv`             Open enough folds to view the cursor line
   `zw`             Permanently mark word as incorrectly spelled
   `zx`             Re-apply 'foldlevel' and do "zv"
   `zy`             Yank without trailing spaces
 * `zz`             Redraw, cursor line at center of window
   `z<Left>`        Same as "zh"
   `z<Right>`       Same as "zl"
   
** `0`            First column
 * `~`            Change case
 * ```            To mark position
 * ````           To last jump position
   `!`            Filter motion through filter.
   `!!{mot}{flt}` Filter lines through external command.
 * `@{char}`      Execute register.
 * `@@`           Repeat previous @{char}
 * `#`            Search word backward
** `$`            End of line
** `%`            Matching
 * `^`            Start of line
 * `&`            Repeat search/substitute
 * `*`            Search word
 * `(`            Previous sentence
 * `)`            Next sentence
   `_`            Count - 1 lines down (start of)
 * `-`            Line up (start of)
 * `+`            Line down (start of)
   `<Tab>`        Next in jump list
** `:`            Command mode
 * `;`            Find next
 * `"{reg}`       Register prefix
 * `'`            To mark line
 * `''`           To last jump line
 * `<{motion}`    Unindent
 * `<<`           Unindent line
 * `,`            Find previous
 * `>{motion}`    Indent
 * `>>`           Indent line
 * `.`            Repeat action
** `?`            Search previous
** `/`            Search
   
 * `CTRL-A`  Increment
 * `CTRL-B`  Scroll back window
   `CTRL-C`  Break
** `CTRL-D`  Scroll down half-window
 * `CTRL-E`  Scroll down line
 * `CTRL-F`  Scroll forward window
*  `CTRL-G`  Show file name
   `CTRL-H`  Left
** `CTRL-I`  Previous jump
   `CTRL-J`  Down
 * `CTRL-K`  Digraph
   `CTRL-L`  Redraw
   `CTRL-M`  Line down (start of)
   `CTRL-N`  Down
** `CTRL-O`  Next jump
   `CTRL-P`  Up
   `CTRL-Q`  Visual block (alternative to CTRL-V in case mapped to paste)
** `CTRL-R`  Redo
   `CTRL-S`  ???
   `CTRL-T`  Previous tag
** `CTRL-U`  Scroll up half-window
 * `CTRL-V`  Visual block
   `CTRL-W`  Window commands (below)
 * `CTRL-X`  Decrement
 * `CTRL-Y`  Scroll up line
   `CTRL-Z`  Suspend (restore with `fg` at command line)
   
   `CTRL-W +`         Increase current window height N lines
   `CTRL-W -`         Decrease current window height N lines
   `CTRL-W :`         Same as |:|, edit a command line
   `CTRL-W <`         Decrease current window width N columns
   `CTRL-W =`         Make all windows the same height & width
   `CTRL-W >`         Increase current window width N columns
   `CTRL-W H`         Move current window to the far left
   `CTRL-W J`         Move current window to the very bottom
   `CTRL-W K`         Move current window to the very top
   `CTRL-W L`         Move current window to the far right
   `CTRL-W P`         Go to preview window
   `CTRL-W R`         Rotate windows upwards N times
   `CTRL-W S`         Same as "CTRL-W s"
   `CTRL-W T`         Move current window to a new tab page
   `CTRL-W W`         Go to N previous window (wrap around)
   `CTRL-W ]`         Split window and jump to tag under cursor
   `CTRL-W ^`         Split current window and edit alternate file N
   `CTRL-W _`         Set current window height to N (default: very high)
   `CTRL-W b`         Go to bottom window
   `CTRL-W c`         Close current window (like |:close|)
   `CTRL-W d`         Split window and jump to definition under the cursor
   `CTRL-W f`         Split window and edit file name under the cursor
   `CTRL-W F`         Split window and edit file name under the cursor and jump to the line number following the file name.
   `CTRL-W g CTRL-]`  Split window and do |:tjump| to tag under cursor
   `CTRL-W g ]`       Split window and do |:tselect| for tag under cursor
   `CTRL-W g }`       Do a |:ptjump| to the tag under the cursor
   `CTRL-W g f`       Edit file name under the cursor in a new tab page
   `CTRL-W g F`       Edit file name under the cursor in a new tab page and jump to the line number following the file name.
   `CTRL-W g t`       Same as `gt`: go to next tab page
   `CTRL-W g T`       Same as `gT`: go to previous tab page
   `CTRL-W g <Tab>`   Same as |g<Tab>|: go to last accessed tab page.
   `CTRL-W h`         Go to Nth left window (stop at first window)
   `CTRL-W i`         Split window and jump to declaration of identifier under the cursor
   `CTRL-W j`         Go N windows down (stop at last window)
   `CTRL-W k`         Go N windows up (stop at first window)
   `CTRL-W l`         Go to Nth right window (stop at last window)
   `CTRL-W n`         Open new window, N lines high
   `CTRL-W o`         Close all but current window (like |:only|)
   `CTRL-W p`         Go to previous (last accessed) window
   `CTRL-W q`         Quit current window (like |:quit|)
   `CTRL-W r`         Rotate windows downwards N times
   `CTRL-W s`         Split current window in two parts, new window N lines high
   `CTRL-W t`         Go to top window
   `CTRL-W v`         Split current window vertically, new window N columns wide
   `CTRL-W w`         Go to N next window (wrap around)
   `CTRL-W x`         Exchange current window with window N (default: next window)
   `CTRL-W z`         Close preview window
   `CTRL-W |`         Set window width to N columns
   `CTRL-W }`         Show tag under cursor in preview window
   `CTRL-W <Down>`    Same as `CTRL-W j`
   `CTRL-W <Up>`      Same as `CTRL-W k`
   `CTRL-W <Left>`    Same as `CTRL-W h`
   `CTRL-W <Right>`   Same as `CTRL-W l`

   ## Surround

   `cs{object}{c}` Change surrounding (e.g. `cs"'`, `cst"`)
   `cs{thing}<{tag}<Enter>` Change surrounding to tag (e.g. `cs"<p<Enter>`)
   `ys{motion|object}{c}` Surround with (e.g. `ysiw[`)
   `ys{motion|object}<{tag}<Enter>` Surround with tag (e.g. `ys2W<foo<Enter>`)
   `yss{c}` Surround line with (e.g. `yssb`, `yss)`)
   `ds{object}` Delete surrounding (e.g. `ds"`)

   Surround chars include: `"` `'` ```` `*` `_` `{` `[` `>` `b` `B`
   Tag char is special: `<` (not `>`)
   Left brace to add space (e.g. `ysw(` vs `ysw)`), also remove space (e.g. `ds(` vs `ds)`)
