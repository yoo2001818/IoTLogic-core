(display "Payload reloading")
; Just some sugaring
(define (require x) (io-exec 'require x))

(define (stringify x)
  (cond
    ((string? x) x)
    ((symbol? x) (symbol->string x))
    ((number? x) (number->string x))
    ((boolean? x) (if x "#t" "#f"))
    (else "")
  )
)

(define (notify target message)
  (io-exec (string-append (stringify target) ":notifier/send") message)
)
