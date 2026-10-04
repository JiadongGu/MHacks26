from app.channels import photon_api


def test_the_welcome_names_the_person_and_their_focus_and_invites_a_question():
    text = photon_api.welcome_text("Gavin", ["sleep better", "protect my skin"])
    assert text.startswith("Welcome to Pulse, Gavin.")
    assert "sleep better, protect my skin" in text and "how did I sleep" in text
    assert text.endswith("Here is your first check-in:")


def test_the_welcome_works_with_no_name_or_focus():
    text = photon_api.welcome_text(None, [])
    assert text.startswith("Welcome to Pulse.") and "working on" not in text
