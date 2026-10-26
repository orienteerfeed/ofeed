# Winner announcements and XML start windows

Sound announcements elect one eligible tab per event and class. Boards only join
the elections for their selected, ranked classes; the client joins for all ranked
classes in the event. Boards with disjoint class selections can therefore announce
independently, while overlapping selections announce each change only once within
the same origin. The elected tab continues to announce while hidden or minimized.
Other eligible tabs wait for ownership and take over when it closes, is muted, or
leaves the results page. Modern browsers use Web Locks; browsers
without Web Locks use a local-storage lease renewed every five seconds and expiring
after thirty seconds. Browser autoplay and speech permissions still apply.

Czech announcements prefer the configured class sex. For mixed or unconfigured
classes, conventional class names provide a fallback; HDR remains mixed and uses
the winner's surname, as do other names without a recognized gender prefix.

IOF class extensions accept prefixed and unprefixed `StartMode`, `StartWindow`,
`StartTime`, and `EndTime` elements, including prefixed children of `StartWindow`.
Importing a provided window boundary updates it; an omitted boundary preserves
the existing setting. Prefix tolerance does not validate the namespace URI or
establish a new extension namespace.
