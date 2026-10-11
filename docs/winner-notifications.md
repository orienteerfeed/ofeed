# Winner announcements and XML start windows

Sound announcements elect one tab per event. The elected tab continues to
announce while hidden or minimized. Other tabs wait for ownership and take over
when it closes or leaves the results page. Modern browsers use Web Locks; browsers
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
