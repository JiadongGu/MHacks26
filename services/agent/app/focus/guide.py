"""What each focus area means, in the assistant's terms. Pure data, no I/O.

The catalog says what a person can pick. This says what picking it asks of Pulse: what the area means, what
the planner puts on the calendar for it, how to coach it in a message, and what to stay away from. The same
text steers the chat assistant, so the plan on the calendar and the advice in iMessage agree.
"""

from dataclasses import dataclass
from typing import Any

from .catalog import BY_KEY


@dataclass(frozen=True)
class Guide:
    means: str  # what the person is really asking for
    plan: str  # what Pulse puts on their calendar
    coach: str  # how to help in a message
    avoid: str  # what not to do or say


GUIDES: dict[str, Guide] = {
    "sleep": Guide(
        "Enough sleep, at a steady time, that leaves them rested.",
        "A wind-down block and a lights-out time before bed. Bedtime moves earlier when tomorrow starts "
        "early.",
        "Talk in hours. Tie the advice to tomorrow's first commitment. Suggest less caffeine after early "
        "afternoon and a calm last half hour.",
        "Guilt, sleep scores, or anything that sounds like a medical sleep diagnosis.",
    ),
    "steps": Guide(
        "More everyday movement, without having to schedule a workout.",
        "A walk of 10 to 30 minutes in a free gap, longer on open days, shorter on busy ones.",
        "Suggest walking calls, a lap after lunch, stairs. Celebrate the total from the watch.",
        "Shaming a low day. A packed day gets a short walk, not a bigger target.",
    ),
    "workouts": Guide(
        "A regular exercise habit, around 150 active minutes a week.",
        "A 15 to 45 minute block, late afternoon first, scaled to how full the day is.",
        "Offer lighter options on busy days. Use resting heart rate against their own baseline to suggest "
        "recovery after a hard day.",
        "Pushing through illness, a high resting heart rate, or pain.",
    ),
    "heart": Guide(
        "Heart-friendly habits and a steady resting heart rate and blood pressure.",
        "An easy 10 to 20 minute walk, never a hard effort.",
        "Compare resting heart rate and HRV to their own baseline. Praise the steady things: walking, sleep.",
        "Judging a rhythm or a blood pressure reading. Chest pain, fainting or severe breathlessness means "
        "get medical care now.",
    ),
    "stress": Guide(
        "Feeling less wound up through the day, with small resets rather than big changes.",
        "A 10 minute breathing break in the afternoon, and room after the heaviest stretches.",
        "Offer one concrete technique: box breathing (in 4, hold 4, out 4, hold 4), or naming five things "
        "they can see. Notice packed days and a low HRV as signs it is a heavy stretch.",
        "Therapy claims or diagnosing anxiety. If they sound unsafe or hopeless, encourage talking to "
        "someone "
        "now (in the US, call or text 988).",
    ),
    "unplug": Guide(
        "A calm evening with screens off before bed.",
        "A wind-down block 30 minutes before lights out.",
        "Suggest a replacement, not just a ban: a shower, a book, stretching, setting up tomorrow.",
        "Lecturing. One slip is fine.",
    ),
    "study": Guide(
        "Protected, focused time for the work that matters, before the day fills up.",
        "30 to 50 minute focus blocks in free time, up to three on an open day, mornings and early "
        "afternoon first.",
        "Use deadlines and exams on their calendar. Suggest one clear goal per block, phone out of reach, "
        "a short break after each. Hardest task first.",
        "All-nighters. Remind them sleep is part of studying.",
    ),
    "balance": Guide(
        "Real rest between busy stretches, so work does not crowd out everything else.",
        "A 20 minute break around midday or mid-afternoon, kept even on a packed day.",
        "On a heavy day, protect one break and add nothing new. On a light day, suggest something they "
        "enjoy.",
        "Adding tasks to a day that is already full.",
    ),
    "routine": Guide(
        "A steady rhythm: the same bedtime and wake time, most days.",
        "A wind-down block at a consistent time before lights out.",
        "Aim for waking within about 30 minutes of the usual time, weekends too. Move bedtime in small "
        "steps.",
        "Large sudden shifts to bedtime.",
    ),
    "hydration": Guide(
        "Drinking enough water without having to think about it.",
        "Two to four short water reminders spread across the day.",
        "Tie it to things they already do: a coffee, a meeting, a walk. Suggest more on workout or hot days.",
        "Naming a number of litres as medical advice. Not planned at all for anyone told to limit fluids "
        "(heart failure, kidney disease).",
    ),
    "sun": Guide(
        "Protecting their skin from the sun.",
        "Sunscreen each morning, a reapply reminder around midday, and a head-to-toe skin check on the first "
        "Sunday of each month.",
        "SPF 30 or higher, broad spectrum, every morning. Reapply about every two hours outdoors and after "
        "swimming. Shade, a hat, sunglasses and UPF clothing, and extra care between 10 am and 4 pm. A "
        "monthly self check for anything new or changing, and a yearly full skin exam with a dermatologist.",
        "Judging whether a spot is harmless. Any new or changing spot, or one that bleeds or itches, means "
        "see a dermatologist soon.",
    ),
}

HEALTH_NOTES: dict[str, str] = {
    "skin_cancer": (
        "Personal history of skin cancer. Sun protection is standing care for them whether or not they "
        "picked it: bring up sunscreen on sunny days and before outdoor plans, suggest a monthly self check "
        "and keeping their yearly dermatology visits. Never say a spot is fine or not fine. Any new or "
        "changing spot means they should see their dermatologist soon."
    ),
}


def guide_for(keys: list[str], flags: set[str]) -> dict[str, Any]:
    """What the assistant should know about this person's focus: one entry per area, plus health notes."""
    areas = [
        {
            "area": BY_KEY[k].label,
            "means": GUIDES[k].means,
            "pulse_plans": GUIDES[k].plan,
            "how_to_help": GUIDES[k].coach,
            "avoid": GUIDES[k].avoid,
        }
        for k in keys
        if k in GUIDES and k in BY_KEY
    ]
    if "skin_cancer" in flags and "sun" not in keys:
        areas.append(
            {
                "area": BY_KEY["sun"].label + " (standing care)",
                "means": GUIDES["sun"].means,
                "pulse_plans": GUIDES["sun"].plan,
                "how_to_help": GUIDES["sun"].coach,
                "avoid": GUIDES["sun"].avoid,
            }
        )
    notes = [HEALTH_NOTES[f] for f in sorted(flags) if f in HEALTH_NOTES]
    return {"focus_areas": areas, "health_notes": notes}
