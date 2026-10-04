from app.voice.speech import speakable


def test_durations_are_spoken_as_words():
    assert speakable("You slept 6.0 h last night.") == "You slept 6 hours last night."
    assert speakable("You slept 6.5 h.") == "You slept 6.5 hours."
    assert speakable("Slept 7 h 15 min.") == "Slept 7 hours 15 minutes."
    assert speakable("Slept 6 h 1 min.") == "Slept 6 hours 1 minute."
    assert speakable("A 1 h walk, then 1 min.") == "A 1 hour walk, then 1 minute."
    assert speakable("A 20 min walk.") == "A 20 minutes walk."


def test_units_and_abbreviations_are_spelled_out():
    assert speakable("Resting heart rate 62 bpm, HRV 87 ms, SpO2 96%.") == (
        "Resting heart rate 62 beats per minute, heart rate variability 87 milliseconds, "
        "blood oxygen 96 percent."
    )
    assert speakable("Put on sunscreen (SPF 30 or higher).") == "Put on sunscreen (S P F 30 or higher)."


def test_bullets_labels_and_brackets_become_sentences():
    text = (
        "Good morning, Gavin.\n\nFocus today:\n• Sleep better: a wind-down\n• Study: 2 blocks\n\n"
        "Coming up: [MECC] Training tomorrow."
    )
    assert speakable(text) == (
        "Good morning, Gavin. Focus today: Sleep better: a wind-down. Study: 2 blocks. "
        "Coming up: MECC Training tomorrow."
    )


def test_plain_text_is_left_alone():
    assert speakable("Have a great day.") == "Have a great day."
    assert speakable("") == ""
