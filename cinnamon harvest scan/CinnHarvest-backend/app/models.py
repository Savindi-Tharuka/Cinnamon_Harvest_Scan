from datetime import datetime, timezone

from mongoengine import DateTimeField, Document, FloatField, IntField, StringField


STEM_STATUS_CHOICES = ("unmatured", "matured", "overmatured", "invalid")


class StemAnalysis(Document):
    meta = {
        "collection": "cinnomon_stem_analyses",
        "indexes": ["status", "-analyzed_at", "thickness"],
    }

    status = StringField(required=True, choices=STEM_STATUS_CHOICES)
    confidence = FloatField(required=True, min_value=0.0, max_value=1.0)
    time_required_to_mature_days = IntField(min_value=1, null=True)
    time_required_to_mature_range = StringField(required=False, null=True)
    analyzed_at = DateTimeField(required=True, default=lambda: datetime.now(timezone.utc))
    photo_filename = StringField(required=True)
    photo_url_path = StringField(required=True)
    thickness = FloatField(required=False, min_value=0.0, null=True)

    def clean(self) -> None:
        if self.status != "unmatured":
            self.time_required_to_mature_days = None
            self.time_required_to_mature_range = None
