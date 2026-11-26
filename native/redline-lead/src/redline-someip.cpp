// SPDX-License-Identifier: MIT
// redline-someip: subscribes the head unit's SOME/IP events it is given and prints each notification as one line,
//   ev 0xSERVICE 0xEVENT HEXPAYLOAD
//   av 0xSERVICE INSTANCE 0|1        (the service offered or not)
//   ok                               (registered with the routing manager)
// Read only: it requests services and subscribes eventgroups, it never sends a request or sets a field.
// It runs as root under redline-lead (the vsomeip policy lets uid 0 see the driving assistant's services, which an
// app's uid does not). It ends when its stdin closes (the parent gone).
//
//   redline-someip SVC:INST:MAJOR:GROUP:EVT[,EVT...][:f] ...     (numbers in C notation; :f a field's notifier)
#include <vsomeip/vsomeip.hpp>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>
#include <unistd.h>

namespace {
struct Spec { vsomeip::service_t svc; vsomeip::instance_t inst; vsomeip::major_version_t major; vsomeip::eventgroup_t group;
              std::vector<vsomeip::event_t> events; bool field; };
std::mutex out_lock;
void line(const std::string &s) { std::lock_guard<std::mutex> g(out_lock); fputs(s.c_str(), stdout); fputc('\n', stdout); fflush(stdout); }
bool parse(const char *arg, Spec &s) {
    std::vector<std::string> p; std::string cur;
    for (const char *c = arg; ; ++c) { if (*c == ':' || !*c) { p.push_back(cur); cur.clear(); if (!*c) break; } else cur += *c; }
    if (p.size() < 5) return false;
    char *end = nullptr;
    s.svc = (vsomeip::service_t)strtoul(p[0].c_str(), &end, 0); s.inst = (vsomeip::instance_t)strtoul(p[1].c_str(), &end, 0);
    s.major = (vsomeip::major_version_t)strtoul(p[2].c_str(), &end, 0); s.group = (vsomeip::eventgroup_t)strtoul(p[3].c_str(), &end, 0);
    std::string evs = p[4]; size_t a = 0;
    while (a <= evs.size()) { size_t b = evs.find(',', a); if (b == std::string::npos) b = evs.size();
        if (b > a) s.events.push_back((vsomeip::event_t)strtoul(evs.substr(a, b - a).c_str(), &end, 0));
        a = b + 1;
    }
    s.field = p.size() > 5 && p[5] == "f";
    return !s.events.empty();
}
}  // namespace

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s SVC:INST:MAJOR:GROUP:EVT[,EVT...][:f] ...\n", argv[0]); return 2; }
    std::vector<Spec> specs;
    for (int i = 1; i < argc; ++i) { Spec s; if (!parse(argv[i], s)) { fprintf(stderr, "bad spec %s\n", argv[i]); return 2; } specs.push_back(s); }
    char name[48]; snprintf(name, sizeof name, "redline-lead-%d", (int)getpid());
    setenv("VSOMEIP_APPLICATION_NAME", name, 0);
    std::shared_ptr<vsomeip::application> app = vsomeip::runtime::get()->create_application(name);
    if (!app || !app->init()) { line("error vsomeip init"); return 1; }
    app->register_message_handler(vsomeip::ANY_SERVICE, vsomeip::ANY_INSTANCE, vsomeip::ANY_METHOD,
        [](const std::shared_ptr<vsomeip::message> &m) {
            std::shared_ptr<vsomeip::payload> p = m->get_payload();
            const vsomeip::byte_t *d = p ? p->get_data() : nullptr; vsomeip::length_t n = p ? p->get_length() : 0;
            static const char *hex = "0123456789abcdef"; char head[40];
            snprintf(head, sizeof head, "ev 0x%04x 0x%04x ", (unsigned)m->get_service(), (unsigned)m->get_method());
            std::string s(head); s.reserve(s.size() + n * 2);
            for (vsomeip::length_t i = 0; i < n; ++i) { s += hex[d[i] >> 4]; s += hex[d[i] & 15]; }
            line(s);
        });
    for (const Spec &s : specs) {
        app->register_availability_handler(s.svc, s.inst, [](vsomeip::service_t sv, vsomeip::instance_t in, bool up) {
            char b[48]; snprintf(b, sizeof b, "av 0x%04x %u %d", (unsigned)sv, (unsigned)in, up ? 1 : 0); line(b); });
    }
    app->register_state_handler([app, specs](vsomeip::state_type_e st) {
        if (st != vsomeip::state_type_e::ST_REGISTERED) return;
        line("ok");
        for (const Spec &s : specs) {
            app->request_service(s.svc, s.inst, s.major, vsomeip::ANY_MINOR);
            std::set<vsomeip::eventgroup_t> g; g.insert(s.group);
            for (vsomeip::event_t e : s.events) app->request_event(s.svc, s.inst, e, g, s.field ? vsomeip::event_type_e::ET_FIELD : vsomeip::event_type_e::ET_EVENT);
            app->subscribe(s.svc, s.inst, s.group, s.major);
        }
    });
    // the parent gone (stdin closed): stop
    std::thread([app] { char b[64]; while (fread(b, 1, sizeof b, stdin) > 0) {} app->stop(); }).detach();
    app->start();
    return 0;
}
