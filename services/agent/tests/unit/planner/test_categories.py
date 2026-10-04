from app.planner import categories, schedule


def test_every_template_and_the_wind_down_has_a_category_with_its_own_colour():
    for key in list(schedule.TEMPLATES) + ["wind_down"]:
        assert categories.category_of(key) in categories.CATEGORIES, key
    ids = [c.color_id for c in categories.CATEGORIES.values()]
    assert len(ids) == len(set(ids)) and "5" not in ids and "11" not in ids


def test_related_items_share_a_colour_and_unknown_keys_fall_back():
    physical = {categories.color_id_for(k) for k in ("steps", "workouts", "move")}
    assert len(physical) == 1
    assert categories.color_id_for("sun") == categories.color_id_for("skin_check")
    assert categories.category_of("something_new") == categories.DEFAULT_CATEGORY
