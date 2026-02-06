import { contains, toList, filter, map } from "./fable_modules/fable-library-js.4.16.0/Seq.js";
import { numberHash, equals, curry2 } from "./fable_modules/fable-library-js.4.16.0/Util.js";
import { nonSeeded } from "./fable_modules/fable-library-js.4.16.0/Random.js";
import { item } from "./fable_modules/fable-library-js.4.16.0/Array.js";
import { Record, Union } from "./fable_modules/fable-library-js.4.16.0/Types.js";
import { record_type, list_type, int32_type, union_type } from "./fable_modules/fable-library-js.4.16.0/Reflection.js";
import { ofArray, tail, head, isEmpty, updateAt, item as item_1 } from "./fable_modules/fable-library-js.4.16.0/List.js";
import { rangeDouble } from "./fable_modules/fable-library-js.4.16.0/Range.js";
import { printf, toConsole } from "./fable_modules/fable-library-js.4.16.0/String.js";

export function explore(moveGen_1, moveExec_1, position) {
    const source = moveGen_1(position);
    return map(curry2(moveExec_1)(position), source);
}

export const random = nonSeeded();

export function pickRandom(moves) {
    const arr = Array.from(moves);
    return item(random.Next1(arr.length), arr);
}

export function monteCarloPlayout(moveGen_1_mut, moveExec_1_mut, isComplete_1_mut, position_mut) {
    monteCarloPlayout:
    while (true) {
        const moveGen_1 = moveGen_1_mut, moveExec_1 = moveExec_1_mut, isComplete_1 = isComplete_1_mut, position = position_mut;
        if (isComplete_1(position)) {
            return position;
        }
        else {
            moveGen_1_mut = moveGen_1;
            moveExec_1_mut = moveExec_1;
            isComplete_1_mut = isComplete_1;
            position_mut = moveExec_1(position, pickRandom(moveGen_1(position)));
            continue monteCarloPlayout;
        }
        break;
    }
}

export class Player extends Union {
    constructor(tag, fields) {
        super();
        this.tag = tag;
        this.fields = fields;
    }
    cases() {
        return ["Human", "Computer"];
    }
}

export function Player_$reflection() {
    return union_type("Mancala.Player", [], Player, () => [[], []]);
}

export class Position extends Record {
    constructor(ToPlay, Pits) {
        super();
        this.ToPlay = ToPlay;
        this.Pits = Pits;
    }
}

export function Position_$reflection() {
    return record_type("Mancala.Position", [], Position, () => [["ToPlay", Player_$reflection()], ["Pits", list_type(int32_type)]]);
}

export function moveGen(position) {
    return filter((p) => (item_1(p, position.Pits) > 0), equals(position.ToPlay, new Player(0, [])) ? toList(rangeDouble(0, 1, 5)) : toList(rangeDouble(7, 1, 12)));
}

export function moveExec(position, move) {
    const play_1 = position.ToPlay;
    if ((equals(play_1, new Player(0, [])) && ((move < 0) ? true : (move > 5))) ? true : (equals(play_1, new Player(1, [])) && ((move < 7) ? true : (move > 12)))) {
        throw new Error("Invalid move");
    }
    const place = (pit, count, position_1) => (new Position(position_1.ToPlay, updateAt(pit, item_1(pit, position_1.Pits) + count, position_1.Pits)));
    const alternateToPlay = (position_2) => (new Position(equals(position_2.ToPlay, new Player(0, [])) ? (new Player(1, [])) : (new Player(0, [])), position_2.Pits));
    const pickup = (pit_1, position_3) => [item_1(pit_1, position_3.Pits), new Position(position_3.ToPlay, updateAt(pit_1, 0, position_3.Pits))];
    const distribute = (numStones_mut, pit_2_mut, position_4_mut) => {
        distribute:
        while (true) {
            const numStones = numStones_mut, pit_2 = pit_2_mut, position_4 = position_4_mut;
            if (numStones === 0) {
                const final = (pit_2 - 1) | 0;
                const count_1 = (pit_3) => item_1(pit_3, position_4.Pits);
                const opposite = (pit_4) => (12 - pit_4);
                if ((final === 6) && equals(position_4.ToPlay, new Player(0, []))) {
                    return position_4;
                }
                else if ((final === 13) && equals(position_4.ToPlay, new Player(1, []))) {
                    return position_4;
                }
                else if (((count_1(final) === 1) && (count_1(opposite(final)) > 0)) && (((final < 6) && equals(position_4.ToPlay, new Player(0, []))) ? true : ((final > 6) && equals(position_4.ToPlay, new Player(1, []))))) {
                    const patternInput = pickup(final, position_4);
                    const patternInput_1 = pickup(opposite(final), patternInput[1]);
                    const position$0027$0027 = patternInput_1[1];
                    return alternateToPlay(place(equals(position$0027$0027.ToPlay, new Player(0, [])) ? 6 : 13, patternInput[0] + patternInput_1[0], position$0027$0027));
                }
                else {
                    return alternateToPlay(position_4);
                }
            }
            else {
                const next = (pit_2 + 1) | 0;
                if (pit_2 > 13) {
                    numStones_mut = numStones;
                    pit_2_mut = 0;
                    position_4_mut = position_4;
                    continue distribute;
                }
                else if ((pit_2 === 6) && equals(play_1, new Player(1, []))) {
                    numStones_mut = numStones;
                    pit_2_mut = next;
                    position_4_mut = position_4;
                    continue distribute;
                }
                else if ((pit_2 === 13) && equals(play_1, new Player(0, []))) {
                    numStones_mut = numStones;
                    pit_2_mut = next;
                    position_4_mut = position_4;
                    continue distribute;
                }
                else {
                    numStones_mut = (numStones - 1);
                    pit_2_mut = next;
                    position_4_mut = place(pit_2, 1, position_4);
                    continue distribute;
                }
            }
            break;
        }
    };
    const patternInput_2 = pickup(move, position);
    return distribute(patternInput_2[0], move + 1, patternInput_2[1]);
}

export function isComplete(position) {
    const matchValue = position.Pits;
    let matchResult;
    if (!isEmpty(matchValue)) {
        if (head(matchValue) === 0) {
            if (!isEmpty(tail(matchValue))) {
                if (head(tail(matchValue)) === 0) {
                    if (!isEmpty(tail(tail(matchValue)))) {
                        if (head(tail(tail(matchValue))) === 0) {
                            if (!isEmpty(tail(tail(tail(matchValue))))) {
                                if (head(tail(tail(tail(matchValue)))) === 0) {
                                    if (!isEmpty(tail(tail(tail(tail(matchValue)))))) {
                                        if (head(tail(tail(tail(tail(matchValue))))) === 0) {
                                            if (!isEmpty(tail(tail(tail(tail(tail(matchValue))))))) {
                                                if (head(tail(tail(tail(tail(tail(matchValue)))))) === 0) {
                                                    matchResult = 0;
                                                }
                                                else if (!isEmpty(tail(tail(tail(tail(tail(tail(matchValue)))))))) {
                                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) {
                                                        if (head(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))) === 0) {
                                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) {
                                                                if (head(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) === 0) {
                                                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) {
                                                                        if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) === 0) {
                                                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) {
                                                                                if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) === 0) {
                                                                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) {
                                                                                        if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) === 0) {
                                                                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))))) {
                                                                                                if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) === 0) {
                                                                                                    matchResult = 1;
                                                                                                }
                                                                                                else {
                                                                                                    matchResult = 2;
                                                                                                }
                                                                                            }
                                                                                            else {
                                                                                                matchResult = 2;
                                                                                            }
                                                                                        }
                                                                                        else {
                                                                                            matchResult = 2;
                                                                                        }
                                                                                    }
                                                                                    else {
                                                                                        matchResult = 2;
                                                                                    }
                                                                                }
                                                                                else {
                                                                                    matchResult = 2;
                                                                                }
                                                                            }
                                                                            else {
                                                                                matchResult = 2;
                                                                            }
                                                                        }
                                                                        else {
                                                                            matchResult = 2;
                                                                        }
                                                                    }
                                                                    else {
                                                                        matchResult = 2;
                                                                    }
                                                                }
                                                                else {
                                                                    matchResult = 2;
                                                                }
                                                            }
                                                            else {
                                                                matchResult = 2;
                                                            }
                                                        }
                                                        else {
                                                            matchResult = 2;
                                                        }
                                                    }
                                                    else {
                                                        matchResult = 2;
                                                    }
                                                }
                                                else {
                                                    matchResult = 2;
                                                }
                                            }
                                            else {
                                                matchResult = 2;
                                            }
                                        }
                                        else if (!isEmpty(tail(tail(tail(tail(tail(matchValue))))))) {
                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(matchValue)))))))) {
                                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) {
                                                    if (head(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))) === 0) {
                                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) {
                                                            if (head(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) === 0) {
                                                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) {
                                                                    if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) === 0) {
                                                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) {
                                                                            if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) === 0) {
                                                                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) {
                                                                                    if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) === 0) {
                                                                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))))) {
                                                                                            if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) === 0) {
                                                                                                matchResult = 1;
                                                                                            }
                                                                                            else {
                                                                                                matchResult = 2;
                                                                                            }
                                                                                        }
                                                                                        else {
                                                                                            matchResult = 2;
                                                                                        }
                                                                                    }
                                                                                    else {
                                                                                        matchResult = 2;
                                                                                    }
                                                                                }
                                                                                else {
                                                                                    matchResult = 2;
                                                                                }
                                                                            }
                                                                            else {
                                                                                matchResult = 2;
                                                                            }
                                                                        }
                                                                        else {
                                                                            matchResult = 2;
                                                                        }
                                                                    }
                                                                    else {
                                                                        matchResult = 2;
                                                                    }
                                                                }
                                                                else {
                                                                    matchResult = 2;
                                                                }
                                                            }
                                                            else {
                                                                matchResult = 2;
                                                            }
                                                        }
                                                        else {
                                                            matchResult = 2;
                                                        }
                                                    }
                                                    else {
                                                        matchResult = 2;
                                                    }
                                                }
                                                else {
                                                    matchResult = 2;
                                                }
                                            }
                                            else {
                                                matchResult = 2;
                                            }
                                        }
                                        else {
                                            matchResult = 2;
                                        }
                                    }
                                    else {
                                        matchResult = 2;
                                    }
                                }
                                else if (!isEmpty(tail(tail(tail(tail(matchValue)))))) {
                                    if (!isEmpty(tail(tail(tail(tail(tail(matchValue))))))) {
                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(matchValue)))))))) {
                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) {
                                                if (head(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))) === 0) {
                                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) {
                                                        if (head(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) === 0) {
                                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) {
                                                                if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) === 0) {
                                                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) {
                                                                        if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) === 0) {
                                                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) {
                                                                                if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) === 0) {
                                                                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))))) {
                                                                                        if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) === 0) {
                                                                                            matchResult = 1;
                                                                                        }
                                                                                        else {
                                                                                            matchResult = 2;
                                                                                        }
                                                                                    }
                                                                                    else {
                                                                                        matchResult = 2;
                                                                                    }
                                                                                }
                                                                                else {
                                                                                    matchResult = 2;
                                                                                }
                                                                            }
                                                                            else {
                                                                                matchResult = 2;
                                                                            }
                                                                        }
                                                                        else {
                                                                            matchResult = 2;
                                                                        }
                                                                    }
                                                                    else {
                                                                        matchResult = 2;
                                                                    }
                                                                }
                                                                else {
                                                                    matchResult = 2;
                                                                }
                                                            }
                                                            else {
                                                                matchResult = 2;
                                                            }
                                                        }
                                                        else {
                                                            matchResult = 2;
                                                        }
                                                    }
                                                    else {
                                                        matchResult = 2;
                                                    }
                                                }
                                                else {
                                                    matchResult = 2;
                                                }
                                            }
                                            else {
                                                matchResult = 2;
                                            }
                                        }
                                        else {
                                            matchResult = 2;
                                        }
                                    }
                                    else {
                                        matchResult = 2;
                                    }
                                }
                                else {
                                    matchResult = 2;
                                }
                            }
                            else {
                                matchResult = 2;
                            }
                        }
                        else if (!isEmpty(tail(tail(tail(matchValue))))) {
                            if (!isEmpty(tail(tail(tail(tail(matchValue)))))) {
                                if (!isEmpty(tail(tail(tail(tail(tail(matchValue))))))) {
                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(matchValue)))))))) {
                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) {
                                            if (head(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))) === 0) {
                                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) {
                                                    if (head(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) === 0) {
                                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) {
                                                            if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) === 0) {
                                                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) {
                                                                    if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) === 0) {
                                                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) {
                                                                            if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) === 0) {
                                                                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))))) {
                                                                                    if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) === 0) {
                                                                                        matchResult = 1;
                                                                                    }
                                                                                    else {
                                                                                        matchResult = 2;
                                                                                    }
                                                                                }
                                                                                else {
                                                                                    matchResult = 2;
                                                                                }
                                                                            }
                                                                            else {
                                                                                matchResult = 2;
                                                                            }
                                                                        }
                                                                        else {
                                                                            matchResult = 2;
                                                                        }
                                                                    }
                                                                    else {
                                                                        matchResult = 2;
                                                                    }
                                                                }
                                                                else {
                                                                    matchResult = 2;
                                                                }
                                                            }
                                                            else {
                                                                matchResult = 2;
                                                            }
                                                        }
                                                        else {
                                                            matchResult = 2;
                                                        }
                                                    }
                                                    else {
                                                        matchResult = 2;
                                                    }
                                                }
                                                else {
                                                    matchResult = 2;
                                                }
                                            }
                                            else {
                                                matchResult = 2;
                                            }
                                        }
                                        else {
                                            matchResult = 2;
                                        }
                                    }
                                    else {
                                        matchResult = 2;
                                    }
                                }
                                else {
                                    matchResult = 2;
                                }
                            }
                            else {
                                matchResult = 2;
                            }
                        }
                        else {
                            matchResult = 2;
                        }
                    }
                    else {
                        matchResult = 2;
                    }
                }
                else if (!isEmpty(tail(tail(matchValue)))) {
                    if (!isEmpty(tail(tail(tail(matchValue))))) {
                        if (!isEmpty(tail(tail(tail(tail(matchValue)))))) {
                            if (!isEmpty(tail(tail(tail(tail(tail(matchValue))))))) {
                                if (!isEmpty(tail(tail(tail(tail(tail(tail(matchValue)))))))) {
                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) {
                                        if (head(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))) === 0) {
                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) {
                                                if (head(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) === 0) {
                                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) {
                                                        if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) === 0) {
                                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) {
                                                                if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) === 0) {
                                                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) {
                                                                        if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) === 0) {
                                                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))))) {
                                                                                if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) === 0) {
                                                                                    matchResult = 1;
                                                                                }
                                                                                else {
                                                                                    matchResult = 2;
                                                                                }
                                                                            }
                                                                            else {
                                                                                matchResult = 2;
                                                                            }
                                                                        }
                                                                        else {
                                                                            matchResult = 2;
                                                                        }
                                                                    }
                                                                    else {
                                                                        matchResult = 2;
                                                                    }
                                                                }
                                                                else {
                                                                    matchResult = 2;
                                                                }
                                                            }
                                                            else {
                                                                matchResult = 2;
                                                            }
                                                        }
                                                        else {
                                                            matchResult = 2;
                                                        }
                                                    }
                                                    else {
                                                        matchResult = 2;
                                                    }
                                                }
                                                else {
                                                    matchResult = 2;
                                                }
                                            }
                                            else {
                                                matchResult = 2;
                                            }
                                        }
                                        else {
                                            matchResult = 2;
                                        }
                                    }
                                    else {
                                        matchResult = 2;
                                    }
                                }
                                else {
                                    matchResult = 2;
                                }
                            }
                            else {
                                matchResult = 2;
                            }
                        }
                        else {
                            matchResult = 2;
                        }
                    }
                    else {
                        matchResult = 2;
                    }
                }
                else {
                    matchResult = 2;
                }
            }
            else {
                matchResult = 2;
            }
        }
        else if (!isEmpty(tail(matchValue))) {
            if (!isEmpty(tail(tail(matchValue)))) {
                if (!isEmpty(tail(tail(tail(matchValue))))) {
                    if (!isEmpty(tail(tail(tail(tail(matchValue)))))) {
                        if (!isEmpty(tail(tail(tail(tail(tail(matchValue))))))) {
                            if (!isEmpty(tail(tail(tail(tail(tail(tail(matchValue)))))))) {
                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) {
                                    if (head(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))) === 0) {
                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) {
                                            if (head(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) === 0) {
                                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) {
                                                    if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) === 0) {
                                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) {
                                                            if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) === 0) {
                                                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) {
                                                                    if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) === 0) {
                                                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))))) {
                                                                            if (head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) === 0) {
                                                                                matchResult = 1;
                                                                            }
                                                                            else {
                                                                                matchResult = 2;
                                                                            }
                                                                        }
                                                                        else {
                                                                            matchResult = 2;
                                                                        }
                                                                    }
                                                                    else {
                                                                        matchResult = 2;
                                                                    }
                                                                }
                                                                else {
                                                                    matchResult = 2;
                                                                }
                                                            }
                                                            else {
                                                                matchResult = 2;
                                                            }
                                                        }
                                                        else {
                                                            matchResult = 2;
                                                        }
                                                    }
                                                    else {
                                                        matchResult = 2;
                                                    }
                                                }
                                                else {
                                                    matchResult = 2;
                                                }
                                            }
                                            else {
                                                matchResult = 2;
                                            }
                                        }
                                        else {
                                            matchResult = 2;
                                        }
                                    }
                                    else {
                                        matchResult = 2;
                                    }
                                }
                                else {
                                    matchResult = 2;
                                }
                            }
                            else {
                                matchResult = 2;
                            }
                        }
                        else {
                            matchResult = 2;
                        }
                    }
                    else {
                        matchResult = 2;
                    }
                }
                else {
                    matchResult = 2;
                }
            }
            else {
                matchResult = 2;
            }
        }
        else {
            matchResult = 2;
        }
    }
    else {
        matchResult = 2;
    }
    switch (matchResult) {
        case 0:
            return true;
        case 1:
            return true;
        default:
            return false;
    }
}

export function score(position) {
    const matchValue = position.Pits;
    let matchResult, c0, c1, c2, c3, c4, c5, ch, h0, h1, h2, h3, h4, h5, hh;
    if (!isEmpty(matchValue)) {
        if (!isEmpty(tail(matchValue))) {
            if (!isEmpty(tail(tail(matchValue)))) {
                if (!isEmpty(tail(tail(tail(matchValue))))) {
                    if (!isEmpty(tail(tail(tail(tail(matchValue)))))) {
                        if (!isEmpty(tail(tail(tail(tail(tail(matchValue))))))) {
                            if (!isEmpty(tail(tail(tail(tail(tail(tail(matchValue)))))))) {
                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))) {
                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))) {
                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))) {
                                            if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))) {
                                                if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))) {
                                                    if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))))) {
                                                        if (!isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))))) {
                                                            if (isEmpty(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))))))) {
                                                                matchResult = 0;
                                                                c0 = head(tail(tail(tail(tail(tail(tail(tail(matchValue))))))));
                                                                c1 = head(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))));
                                                                c2 = head(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))));
                                                                c3 = head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))));
                                                                c4 = head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))));
                                                                c5 = head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue)))))))))))));
                                                                ch = head(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(tail(matchValue))))))))))))));
                                                                h0 = head(matchValue);
                                                                h1 = head(tail(matchValue));
                                                                h2 = head(tail(tail(matchValue)));
                                                                h3 = head(tail(tail(tail(matchValue))));
                                                                h4 = head(tail(tail(tail(tail(matchValue)))));
                                                                h5 = head(tail(tail(tail(tail(tail(matchValue))))));
                                                                hh = head(tail(tail(tail(tail(tail(tail(matchValue)))))));
                                                            }
                                                            else {
                                                                matchResult = 1;
                                                            }
                                                        }
                                                        else {
                                                            matchResult = 1;
                                                        }
                                                    }
                                                    else {
                                                        matchResult = 1;
                                                    }
                                                }
                                                else {
                                                    matchResult = 1;
                                                }
                                            }
                                            else {
                                                matchResult = 1;
                                            }
                                        }
                                        else {
                                            matchResult = 1;
                                        }
                                    }
                                    else {
                                        matchResult = 1;
                                    }
                                }
                                else {
                                    matchResult = 1;
                                }
                            }
                            else {
                                matchResult = 1;
                            }
                        }
                        else {
                            matchResult = 1;
                        }
                    }
                    else {
                        matchResult = 1;
                    }
                }
                else {
                    matchResult = 1;
                }
            }
            else {
                matchResult = 1;
            }
        }
        else {
            matchResult = 1;
        }
    }
    else {
        matchResult = 1;
    }
    switch (matchResult) {
        case 0:
            return ((((((h0 + h1) + h2) + h3) + h4) + h5) + hh) - ((((((c0 + c1) + c2) + c3) + c4) + c5) + ch);
        default:
            throw new Error("Invalid position");
    }
}

export function print(position) {
    const s = (i) => item_1(i, position.Pits);
    toConsole(printf(""));
    toConsole(printf(""));
    const arg = s(12) | 0;
    const arg_1 = s(11) | 0;
    const arg_2 = s(10) | 0;
    const arg_3 = s(9) | 0;
    const arg_4 = s(8) | 0;
    const arg_5 = s(7) | 0;
    toConsole(printf("   %i  %i  %i  %i  %i  %i"))(arg)(arg_1)(arg_2)(arg_3)(arg_4)(arg_5);
    const arg_6 = s(13) | 0;
    const arg_7 = s(6) | 0;
    toConsole(printf("%i                    %i  %A"))(arg_6)(arg_7)(position.ToPlay);
    const arg_9 = s(0) | 0;
    const arg_10 = s(1) | 0;
    const arg_11 = s(2) | 0;
    const arg_12 = s(3) | 0;
    const arg_13 = s(4) | 0;
    const arg_14 = s(5) | 0;
    toConsole(printf("   %i  %i  %i  %i  %i  %i"))(arg_9)(arg_10)(arg_11)(arg_12)(arg_13)(arg_14);
}

toConsole(printf("Monte Carlo Mancala"));

export function promptForMove(position) {
    try {
        if (contains(0, moveGen(position), {
            Equals: (x, y) => (x === y),
            GetHashCode: numberHash,
        })) {
            return 0;
        }
        else {
            throw new Error("Illegal");
        }
    }
    catch (ex) {
        const arg = ex.message;
        toConsole(printf("Invalid move: %s"))(arg);
        return promptForMove(position) | 0;
    }
}

export const init = new Position(new Player(0, []), ofArray([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]));

export function play(position_mut) {
    let comp;
    play:
    while (true) {
        const position = position_mut;
        print(position);
        const position$0027 = moveExec(position, equals(position.ToPlay, new Player(0, [])) ? promptForMove(position) : ((comp = (pickRandom(moveGen(position)) | 0), (toConsole(printf("MOVE: %i"))(comp), comp))));
        if (isComplete(position$0027)) {
            print(position$0027);
            const arg_1 = ~~score(position$0027) | 0;
            toConsole(printf("GAME OVER (score %i)"))(arg_1);
        }
        else {
            position_mut = position$0027;
            continue play;
        }
        break;
    }
}

play(init);

